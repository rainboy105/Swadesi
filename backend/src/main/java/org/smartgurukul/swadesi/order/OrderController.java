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
                                OffsetDateTime createdAt) {}

    public record StatusRequest(String status) {}

    private final FoodOrderRepository orders;
    private final ListingRepository listings;
    private final UserRepository users;
    private final WhatsAppSender whatsApp;

    public OrderController(FoodOrderRepository orders, ListingRepository listings,
                           UserRepository users, WhatsAppSender whatsApp) {
        this.orders = orders;
        this.listings = listings;
        this.users = users;
        this.whatsApp = whatsApp;
    }

    /** Consumer places an order. Claims servings atomically (oversell- and cutoff-safe). */
    @PostMapping
    @Transactional
    public OrderResponse place(@AuthenticationPrincipal AuthenticatedUser auth,
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
        FoodOrder o = new FoodOrder();
        o.setId(UUID.randomUUID());
        o.setListingId(l.getId());
        o.setConsumerId(consumer.getId());
        o.setConsumerName(consumer.getName());
        o.setConsumerPhone(consumer.getPhone());
        o.setQty(req.qty());
        o.setStatus("requested");
        o.setCreatedAt(now);
        o.setUpdatedAt(now);
        orders.save(o);

        // Notify the cook (never fails the order).
        users.findById(l.getCookId()).ifPresent(cook -> notify(cook.getPhone(),
                "New Swaadeshi order: " + req.qty() + " × " + l.getTitle()
                        + (consumer.getName() != null ? " from " + consumer.getName() : "")
                        + ". Open the app to accept."));

        return toResponse(o, l.getTitle(), l.getCookName());
    }

    /** The consumer's own orders. */
    @GetMapping("/mine")
    public List<OrderResponse> mine(@AuthenticationPrincipal AuthenticatedUser auth) {
        List<FoodOrder> mine = orders.findByConsumerIdOrderByCreatedAtDesc(auth.id());
        Map<UUID, Listing> byId = loadListings(mine);
        List<OrderResponse> out = new ArrayList<>();
        for (FoodOrder o : mine) {
            Listing l = byId.get(o.getListingId());
            out.add(toResponse(o, l == null ? "(dish)" : l.getTitle(), l == null ? null : l.getCookName()));
        }
        return out;
    }

    /** Orders placed on the cook's own listings. */
    @GetMapping("/received")
    public List<OrderResponse> received(@AuthenticationPrincipal AuthenticatedUser auth) {
        List<Listing> myListings = listings.findByCookIdOrderByCreatedAtDesc(auth.id());
        if (myListings.isEmpty()) return List.of();
        Map<UUID, Listing> byId = new HashMap<>();
        for (Listing l : myListings) byId.put(l.getId(), l);
        List<OrderResponse> out = new ArrayList<>();
        for (FoodOrder o : orders.findByListingIdInOrderByCreatedAtDesc(byId.keySet())) {
            Listing l = byId.get(o.getListingId());
            out.add(toResponse(o, l == null ? "(dish)" : l.getTitle(), l == null ? null : l.getCookName()));
        }
        return out;
    }

    /** Cook accepts or rejects an order on their listing. Rejecting releases the servings. */
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
        if (!s.equals("accepted") && !s.equals("rejected")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "status must be 'accepted' or 'rejected'");
        }
        if (!"requested".equals(o.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This order was already " + o.getStatus());
        }
        o.setStatus(s);
        o.setUpdatedAt(now);
        orders.save(o);

        if (s.equals("rejected")) {
            listings.release(l.getId(), o.getQty(), now); // give the servings back
        }
        // Notify the consumer.
        notify(o.getConsumerPhone(), s.equals("accepted")
                ? "Your Swaadeshi order (" + o.getQty() + " × " + l.getTitle() + ") was accepted! 🎉"
                : "Sorry, your Swaadeshi order (" + o.getQty() + " × " + l.getTitle() + ") was declined.");

        return toResponse(o, l.getTitle(), l.getCookName());
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

    private static OrderResponse toResponse(FoodOrder o, String title, String cookName) {
        return new OrderResponse(o.getId().toString(), o.getListingId().toString(), title,
                o.getQty(), o.getStatus(), cookName, o.getConsumerName(), o.getCreatedAt());
    }
}
