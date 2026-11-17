package org.smartgurukul.swadesi.order;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.smartgurukul.swadesi.listing.Listing;
import org.smartgurukul.swadesi.listing.ListingRepository;
import org.smartgurukul.swadesi.security.AuthenticatedUser;
import org.smartgurukul.swadesi.user.User;
import org.smartgurukul.swadesi.user.UserRepository;
import org.smartgurukul.swadesi.whatsapp.WhatsAppSender;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {

    private static final Logger log = LoggerFactory.getLogger(OrderController.class);

    public record PlaceRequest(@NotNull UUID listingId, @Min(1) @Max(50) int qty) {}

    public record OrderResponse(String id, String listingId, String listingTitle, int qty,
                                String status, String cookName, String consumerName,
                                String pickupCode, Double cookLat, Double cookLng,
                                OffsetDateTime createdAt) {}

    public record StatusRequest(String status, String pickupCode) {}

    public record BulkStatusRequest(String status) {}

    // Allowed forward transitions in the order lifecycle.
    private static final java.util.Map<String, java.util.Set<String>> NEXT = java.util.Map.of(
            "requested", java.util.Set.of("accepted", "rejected"),
            "accepted", java.util.Set.of("preparing"),
            "preparing", java.util.Set.of("ready"),
            "ready", java.util.Set.of("completed"));

    public record PlaceResponse(OrderResponse order, boolean paymentRequired,
                                String razorpayOrderId, String razorpayKeyId,
                                Integer amountPaise, String currency, String dish) {}

    public record VerifyRequest(String razorpayOrderId, String razorpayPaymentId, String razorpaySignature) {}

    private final FoodOrderRepository orders;
    private final ListingRepository listings;
    private final UserRepository users;
    private final WhatsAppSender whatsApp;
    private final org.smartgurukul.swadesi.payment.RazorpayService razorpay;
    private final org.smartgurukul.swadesi.request.DishRequestRepository dishRequests;

    public OrderController(FoodOrderRepository orders, ListingRepository listings,
                           UserRepository users, WhatsAppSender whatsApp,
                           org.smartgurukul.swadesi.payment.RazorpayService razorpay,
                           org.smartgurukul.swadesi.request.DishRequestRepository dishRequests) {
        this.orders = orders;
        this.listings = listings;
        this.users = users;
        this.whatsApp = whatsApp;
        this.razorpay = razorpay;
        this.dishRequests = dishRequests;
    }

    /**
     * Consumer places an order. Claims servings atomically (oversell- and cutoff-safe). When
     * Razorpay is configured, the order starts 'pending_payment' and the cook is notified only
     * after payment is verified; otherwise it goes straight to 'requested'.
     */
    @PostMapping
    @Transactional
    public PlaceResponse place(@AuthenticationPrincipal AuthenticatedUser auth,
                               @Valid @RequestBody PlaceRequest req) {
        OffsetDateTime now = OffsetDateTime.now();
        Listing l = listings.findById(req.listingId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Dish not found"));
        if (l.getCookId().equals(auth.id())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You can't order your own dish");
        }
        if (!"open".equals(l.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This dish is no longer available");
        }
        // A request-only listing is private: only the consumer whose accepted request created it may order it.
        if (l.isRequestOnly()) {
            boolean ok = dishRequests.findByListingId(l.getId())
                    .filter(r -> r.getConsumerId().equals(auth.id()) && "accepted".equals(r.getStatus()))
                    .isPresent();
            if (!ok) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This dish isn't available to order.");
            }
        }
        if (l.getOrderBy() != null && !l.getOrderBy().isAfter(now)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ordering has closed for this dish");
        }

        // Atomic claim: the DB enforces the cap and cutoff in one statement.
        int claimed = listings.claim(l.getId(), req.qty(), now);
        if (claimed == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Not enough servings left (or ordering just closed)");
        }

        User consumer = users.findById(auth.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        boolean pay = razorpay.isConfigured();
        int amountPaise = l.getPricePerServing() * req.qty() * 100;

        FoodOrder o = new FoodOrder();
        o.setId(UUID.randomUUID());
        o.setListingId(l.getId());
        o.setConsumerId(consumer.getId());
        o.setConsumerName(consumer.getName());
        o.setConsumerPhone(consumer.getPhone());
        o.setQty(req.qty());
        o.setStatus(pay ? "pending_payment" : "requested");
        o.setPickupCode(String.format("%04d", new java.security.SecureRandom().nextInt(10000)));
        o.setAmountPaise(amountPaise);
        o.setCreatedAt(now);
        o.setUpdatedAt(now);

        if (pay) {
            try {
                o.setRazorpayOrderId(razorpay.createOrder(amountPaise, "order_" + o.getId()));
            } catch (Exception e) {
                listings.release(l.getId(), req.qty(), now); // release the hold if payment setup fails
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Couldn't start payment. Please try again.");
            }
            orders.save(o);
            return new PlaceResponse(toResponse(o, l, true), true, o.getRazorpayOrderId(),
                    razorpay.keyId(), amountPaise, "INR", l.getTitle());
        }

        orders.save(o);
        markRequestFulfilled(l, o);
        notifyCookNewOrder(l, consumer, req.qty());
        return new PlaceResponse(toResponse(o, l, true), false, null, null, null, null, null);
    }

    /** If this order fulfils an accepted dish request, mark the request fulfilled. */
    private void markRequestFulfilled(Listing l, FoodOrder o) {
        if (l == null || !l.isRequestOnly()) return;
        dishRequests.findByListingId(l.getId()).ifPresent(r -> {
            if (!"accepted".equals(r.getStatus())) return; // already fulfilled, or no longer open
            r.setStatus("fulfilled");
            r.setOrderId(o.getId());
            r.setUpdatedAt(OffsetDateTime.now());
            dishRequests.save(r);
        });
    }

    /** Verify the Razorpay payment, mark the order paid, and release it to the cook. */
    @PostMapping("/{id}/verify-payment")
    @Transactional
    public OrderResponse verifyPayment(@AuthenticationPrincipal AuthenticatedUser auth,
                                       @PathVariable UUID id, @RequestBody VerifyRequest req) {
        FoodOrder o = orders.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found"));
        if (!o.getConsumerId().equals(auth.id())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your order");
        }
        if (!"pending_payment".equals(o.getStatus())) {
            // Idempotent: already verified (the webhook or reconcile may have got there first).
            Listing l0 = listings.findById(o.getListingId()).orElse(null);
            if (o.isPaid()) markRequestFulfilled(l0, o);
            return toResponse(o, l0, true);
        }
        if (!razorpay.verifySignature(req.razorpayOrderId(), req.razorpayPaymentId(), req.razorpaySignature())
                || !req.razorpayOrderId().equals(o.getRazorpayOrderId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Payment could not be verified");
        }
        o.setRazorpayPaymentId(req.razorpayPaymentId());
        o.setPaid(true);
        o.setStatus("requested");
        o.setUpdatedAt(OffsetDateTime.now());
        orders.save(o);

        Listing l = listings.findById(o.getListingId()).orElse(null);
        markRequestFulfilled(l, o);
        if (l != null) {
            users.findById(l.getCookId()).ifPresent(cook -> notify(cook.getPhone(),
                    "New Swaadesi order: " + o.getQty() + " × " + l.getTitle()
                            + (o.getConsumerName() != null ? " from " + o.getConsumerName() : "")
                            + ". Open the app to accept."));
        }
        return toResponse(o, l, true);
    }

    /** Consumer abandoned checkout: release the held servings. */
    @PostMapping("/{id}/cancel-unpaid")
    @Transactional
    public void cancelUnpaid(@AuthenticationPrincipal AuthenticatedUser auth, @PathVariable UUID id) {
        FoodOrder o = orders.findById(id).orElse(null);
        if (o == null || !o.getConsumerId().equals(auth.id())) return;
        if (!"pending_payment".equals(o.getStatus())) return;
        // Don't cancel if the payment actually went through (UPI timeout can look like a dismiss).
        Listing l = listings.findById(o.getListingId()).orElse(null);
        reconcileIfPaid(o, l);
        if ("requested".equals(o.getStatus())) return; // it was paid after all
        o.setStatus("cancelled");
        o.setUpdatedAt(OffsetDateTime.now());
        orders.save(o);
        listings.release(o.getListingId(), o.getQty(), OffsetDateTime.now());
    }

    /**
     * Consumer cancels their own order. Allowed only before the cook starts preparing
     * (requested or accepted). Releases the servings, refunds a paid order in full and tells
     * the cook.
     */
    @PostMapping("/{id}/cancel")
    @Transactional
    public OrderResponse cancelByConsumer(@AuthenticationPrincipal AuthenticatedUser auth,
                                          @PathVariable UUID id) {
        OffsetDateTime now = OffsetDateTime.now();
        FoodOrder o = orders.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found"));
        if (!o.getConsumerId().equals(auth.id())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your order");
        }
        String st = o.getStatus();
        if (!"requested".equals(st) && !"accepted".equals(st)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "preparing".equals(st) || "ready".equals(st)
                            ? "The cook has already started preparing this order, so it can't be cancelled."
                            : "This order can't be cancelled.");
        }
        o.setStatus("cancelled");
        o.setUpdatedAt(now);
        orders.save(o);
        listings.release(o.getListingId(), o.getQty(), now); // give the servings back

        if (o.isPaid() && o.getRazorpayPaymentId() != null && o.getAmountPaise() != null) {
            razorpay.refund(o.getRazorpayPaymentId(), o.getAmountPaise());
        }
        Listing l = listings.findById(o.getListingId()).orElse(null);
        if (l != null) {
            users.findById(l.getCookId()).ifPresent(cook -> notify(cook.getPhone(),
                    "Swaadesi order cancelled by the customer: " + o.getQty() + " × " + l.getTitle()
                            + (o.getConsumerName() != null ? " (" + o.getConsumerName() + ")" : "")
                            + ". No need to prepare it."));
        }
        return toResponse(o, l, true);
    }

    private void notifyCookNewOrder(Listing l, User consumer, int qty) {
        users.findById(l.getCookId()).ifPresent(cook -> notify(cook.getPhone(),
                "New Swaadesi order: " + qty + " × " + l.getTitle()
                        + (consumer.getName() != null ? " from " + consumer.getName() : "")
                        + ". Open the app to accept."));
    }

    /** The consumer's own orders (includes the pickup code to show the cook). */
    @GetMapping("/mine")
    @Transactional
    public List<OrderResponse> mine(@AuthenticationPrincipal AuthenticatedUser auth) {
        List<FoodOrder> mine = orders.findByConsumerIdOrderByCreatedAtDesc(auth.id());
        Map<UUID, Listing> byId = loadListings(mine);
        List<OrderResponse> out = new ArrayList<>();
        for (FoodOrder o : mine) {
            Listing l = byId.get(o.getListingId());
            reconcileIfPaid(o, l); // flip to paid if Razorpay captured but the browser never confirmed
            out.add(toResponse(o, l, true));
        }
        return out;
    }

    /**
     * If a pending order's Razorpay payment is actually captured, mark it paid and notify the
     * cook. Covers UPI timeouts / closed tabs where checkout showed "failed" but money went through.
     */
    private void reconcileIfPaid(FoodOrder o, Listing l) {
        if (!"pending_payment".equals(o.getStatus()) || o.getRazorpayOrderId() == null) return;
        String paymentId = razorpay.capturedPaymentId(o.getRazorpayOrderId());
        if (paymentId == null) return;
        o.setRazorpayPaymentId(paymentId);
        o.setPaid(true);
        o.setStatus("requested");
        o.setUpdatedAt(OffsetDateTime.now());
        orders.save(o);
        markRequestFulfilled(l, o);
        if (l != null) {
            users.findById(l.getCookId()).ifPresent(cook -> notify(cook.getPhone(),
                    "New Swaadesi order: " + o.getQty() + " × " + l.getTitle()
                            + (o.getConsumerName() != null ? " from " + o.getConsumerName() : "")
                            + ". Open the app to accept."));
        }
    }

    /** Orders placed on the cook's own listings (pickup code hidden — the consumer tells it). */
    @GetMapping("/received")
    public List<OrderResponse> received(@AuthenticationPrincipal AuthenticatedUser auth) {
        List<Listing> myListings = listings.findByCookIdOrderByCreatedAtDesc(auth.id());
        if (myListings.isEmpty()) return List.of();
        Map<UUID, Listing> byId = new HashMap<>();
        for (Listing l : myListings) byId.put(l.getId(), l);
        List<OrderResponse> out = new ArrayList<>();
        for (FoodOrder o : orders.findByListingIdInOrderByCreatedAtDesc(byId.keySet())) {
            if ("pending_payment".equals(o.getStatus())) continue; // unpaid: hidden from the cook
            Listing l = byId.get(o.getListingId());
            out.add(toResponse(o, l, false));
        }
        return out;
    }

    /**
     * Cook moves an order forward: requested→accepted/rejected, accepted→preparing,
     * preparing→ready, ready→completed. Completing requires the consumer's pickup code.
     * Rejecting releases the servings.
     */
    @PostMapping("/{id}/status")
    @Transactional
    public OrderResponse setStatus(@AuthenticationPrincipal AuthenticatedUser auth,
                                   @PathVariable UUID id, @RequestBody StatusRequest req) {
        OffsetDateTime now = OffsetDateTime.now();
        FoodOrder o = orders.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found"));
        Listing l = listings.findById(o.getListingId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Dish not found"));
        if (!l.getCookId().equals(auth.id())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your order to manage");
        }
        String s = req.status() == null ? "" : req.status().trim().toLowerCase();
        java.util.Set<String> allowed = NEXT.getOrDefault(o.getStatus(), java.util.Set.of());
        if (!allowed.contains(s)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Can't move an order from " + o.getStatus() + " to " + s);
        }
        // Pickup must be confirmed with the consumer's code.
        if (s.equals("completed")) {
            String given = req.pickupCode() == null ? "" : req.pickupCode().trim();
            if (o.getPickupCode() == null || !o.getPickupCode().equals(given)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Wrong pickup code");
            }
        }
        o.setStatus(s);
        o.setUpdatedAt(now);
        orders.save(o);

        if (s.equals("rejected")) {
            listings.release(l.getId(), o.getQty(), now); // give the servings back
            // Prepaid order declined -> auto-refund.
            if (o.isPaid() && o.getRazorpayPaymentId() != null && o.getAmountPaise() != null) {
                razorpay.refund(o.getRazorpayPaymentId(), o.getAmountPaise());
            }
        }
        notifyStatusChange(o, l, s);
        return toResponse(o, l, false);
    }

    /**
     * Cook advances every order of one dish by a single step (accepted / preparing / ready),
     * instead of touching each order. The pickup code stays unique per order, so each customer
     * still gets their own code when the dish is marked ready, and pickup is confirmed per order.
     */
    @PostMapping("/listing/{listingId}/status")
    @Transactional
    public List<OrderResponse> bulkStatus(@AuthenticationPrincipal AuthenticatedUser auth,
                                          @PathVariable UUID listingId,
                                          @RequestBody BulkStatusRequest req) {
        Listing l = listings.findById(listingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Dish not found"));
        if (!l.getCookId().equals(auth.id())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your dish to manage");
        }
        String s = req.status() == null ? "" : req.status().trim().toLowerCase();
        // Only forward cooking steps can be bulk-applied; pickup (completed) needs each order's
        // code, and rejecting is a per-order decision.
        if (!java.util.Set.of("accepted", "preparing", "ready").contains(s)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bulk update supports 'accepted', 'preparing' or 'ready' only");
        }
        OffsetDateTime now = OffsetDateTime.now();
        List<OrderResponse> out = new ArrayList<>();
        for (FoodOrder o : orders.findByListingIdInOrderByCreatedAtDesc(java.util.Set.of(listingId))) {
            // Advance only orders currently in the step right before the target.
            if (!NEXT.getOrDefault(o.getStatus(), java.util.Set.of()).contains(s)) continue;
            o.setStatus(s);
            o.setUpdatedAt(now);
            orders.save(o);
            notifyStatusChange(o, l, s);
            out.add(toResponse(o, l, false));
        }
        return out;
    }

    /** Tell the consumer their order moved. For 'ready', includes their own pickup code. */
    private void notifyStatusChange(FoodOrder o, Listing l, String s) {
        boolean refunded = s.equals("rejected") && o.isPaid();
        String msg = switch (s) {
            case "accepted" -> "Your Swaadesi order (" + o.getQty() + " × " + l.getTitle() + ") was accepted! 🎉";
            case "preparing" -> l.getTitle() + " is being prepared. We'll tell you when it's ready.";
            case "ready" -> "Your order is ready for pickup! 🛍️ Show the cook your pickup code: "
                    + o.getPickupCode() + " (" + o.getQty() + " × " + l.getTitle() + ")";
            case "completed" -> "Order picked up. Enjoy your meal! 🍴 (" + o.getQty() + " × " + l.getTitle() + ")";
            default -> "Sorry, your Swaadesi order (" + o.getQty() + " × " + l.getTitle() + ") was declined."
                    + (refunded ? " Your payment has been refunded." : "");
        };
        notify(o.getConsumerPhone(), msg);
    }

    private Map<UUID, Listing> loadListings(List<FoodOrder> os) {
        List<UUID> ids = os.stream().map(FoodOrder::getListingId).distinct().toList();
        Map<UUID, Listing> byId = new HashMap<>();
        for (Listing l : listings.findAllById(ids)) byId.put(l.getId(), l);
        return byId;
    }

    private void notify(String phone, String text) {
        if (phone == null) return;
        try {
            whatsApp.send(phone, text);
        } catch (Exception e) {
            log.warn("order notify failed to {} ({})", WhatsAppSender.mask(phone), WhatsAppSender.failureReason(e));
        }
    }

    private static OrderResponse toResponse(FoodOrder o, Listing l, boolean includeCode) {
        String title = l == null ? "(dish)" : l.getTitle();
        String cookName = l == null ? null : l.getCookName();
        String st = o.getStatus();
        // The pickup code is revealed to the consumer only once the order is ready (or picked up).
        boolean revealCode = includeCode && ("ready".equals(st) || "completed".equals(st));
        // The cook's pickup location is shown to the consumer once the order is accepted.
        boolean revealLoc = includeCode && l != null
                && ("accepted".equals(st) || "preparing".equals(st) || "ready".equals(st) || "completed".equals(st));
        return new OrderResponse(o.getId().toString(), o.getListingId().toString(), title,
                o.getQty(), st, cookName, o.getConsumerName(),
                revealCode ? o.getPickupCode() : null,
                revealLoc ? l.getLat() : null, revealLoc ? l.getLng() : null,
                o.getCreatedAt());
    }
}
