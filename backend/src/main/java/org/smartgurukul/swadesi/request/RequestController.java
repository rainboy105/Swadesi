package org.smartgurukul.swadesi.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.smartgurukul.swadesi.listing.Listing;
import org.smartgurukul.swadesi.listing.ListingController;
import org.smartgurukul.swadesi.listing.ListingRepository;
import org.smartgurukul.swadesi.push.PushService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.smartgurukul.swadesi.security.AuthenticatedUser;
import org.smartgurukul.swadesi.user.User;
import org.smartgurukul.swadesi.user.UserRepository;
import org.smartgurukul.swadesi.whatsapp.WhatsAppSender;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Consumer requests a dish from a cook; the cook accepts (with a price) or rejects. */
@RestController
@RequestMapping("/api/v1/requests")
public class RequestController {

    public record CreateRequest(
            @NotNull UUID cookId,
            @NotBlank @Size(max = 120) String dishName,
            @Min(1) @Max(50) int qty,
            @Size(max = 500) String note,
            UUID menuItemId) {}

    /** Price is optional: a request raised from a priced menu item is accepted at that price. */
    public record AcceptRequest(@Min(0) @Max(100000) Integer pricePerServing) {}

    public record RequestResponse(String id, String dishName, int qty, String note, String status,
                                  Integer pricePerServing, String cookName, String consumerName,
                                  String listingId, OffsetDateTime createdAt) {}

    private static final Logger log = LoggerFactory.getLogger(RequestController.class);

    private final DishRequestRepository requests;
    private final ListingRepository listings;
    private final UserRepository users;
    private final PushService push;
    private final WhatsAppSender whatsApp;
    private final org.smartgurukul.swadesi.menu.MenuItemRepository menu;
    private final org.smartgurukul.swadesi.order.FoodOrderRepository orders;

    public RequestController(DishRequestRepository requests, ListingRepository listings,
                            UserRepository users, PushService push, WhatsAppSender whatsApp,
                            org.smartgurukul.swadesi.menu.MenuItemRepository menu,
                            org.smartgurukul.swadesi.order.FoodOrderRepository orders) {
        this.orders = orders;
        this.requests = requests;
        this.listings = listings;
        this.users = users;
        this.push = push;
        this.whatsApp = whatsApp;
        this.menu = menu;
    }

    private void notifyWhatsApp(String phone, String text) {
        if (phone == null) return;
        try {
            whatsApp.send(phone, text);
        } catch (Exception e) {
            log.warn("request notify failed to {} ({})",
                    WhatsAppSender.mask(phone), WhatsAppSender.failureReason(e));
        }
    }

    /** Consumer creates a dish request to a cook. */
    @PostMapping
    public RequestResponse create(@AuthenticationPrincipal AuthenticatedUser auth,
                                  @Valid @RequestBody CreateRequest req) {
        if (req.cookId().equals(auth.id())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You can't request from yourself.");
        }
        User consumer = users.findById(auth.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        User cook = users.findById(req.cookId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Cook not found"));
        OffsetDateTime now = OffsetDateTime.now();
        DishRequest r = new DishRequest();
        r.setId(UUID.randomUUID());
        r.setConsumerId(consumer.getId());
        r.setConsumerName(consumer.getName());
        r.setConsumerPhone(consumer.getPhone());
        r.setCookId(cook.getId());
        r.setCookName(cook.getName());
        String dishName = req.dishName().trim();
        // If raised from a menu item, validate it belongs to this cook and trust its name.
        if (req.menuItemId() != null) {
            org.smartgurukul.swadesi.menu.MenuItem item = menu.findById(req.menuItemId()).orElse(null);
            if (item != null && item.getCookId().equals(cook.getId())) {
                r.setMenuItemId(item.getId());
                dishName = item.getName();
                r.setPricePerServing(item.getPricePerServing()); // the menu price, shown to the cook
            }
        }
        r.setDishName(dishName);
        r.setQty(req.qty());
        r.setNote(req.note() == null || req.note().isBlank() ? null : req.note().trim());
        r.setStatus("pending");
        r.setCreatedAt(now);
        r.setUpdatedAt(now);
        DishRequest saved = requests.save(r);
        String who = consumer.getName() == null ? "Someone" : consumer.getName();
        push.notifyUsers(List.of(cook.getId()), "New dish request 🍽️",
                who + " requested " + r.getQty() + " × " + r.getDishName(), "/");
        notifyWhatsApp(cook.getPhone(), "New Swaadesi request: " + r.getQty() + " × " + r.getDishName()
                + " from " + who + (r.getNote() != null ? " (\"" + r.getNote() + "\")" : "")
                + ". Open the app to accept with a price or decline.");
        return toResponse(saved);
    }

    /** The consumer's own requests. */
    @GetMapping("/mine")
    public List<RequestResponse> mine(@AuthenticationPrincipal AuthenticatedUser auth) {
        return requests.findByConsumerIdOrderByCreatedAtDesc(auth.id()).stream()
                .map(this::closeIfPaid).map(RequestController::toResponse).toList();
    }

    /** Requests addressed to the logged-in cook. */
    @GetMapping("/incoming")
    public List<RequestResponse> incoming(@AuthenticationPrincipal AuthenticatedUser auth) {
        return requests.findByCookIdOrderByCreatedAtDesc(auth.id()).stream()
                .map(this::closeIfPaid).map(RequestController::toResponse).toList();
    }

    /** Cook accepts a request with a price/serving; creates a private listing to pay against. */
    @PostMapping("/{id}/accept")
    public RequestResponse accept(@AuthenticationPrincipal AuthenticatedUser auth,
                                  @PathVariable UUID id,
                                  @Valid @RequestBody(required = false) AcceptRequest body) {
        DishRequest r = requests.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Request not found"));
        if (!r.getCookId().equals(auth.id())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your request");
        }
        if (!"pending".equals(r.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This request is no longer pending.");
        }
        User cook = users.findById(auth.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        OffsetDateTime now = OffsetDateTime.now();
        // Price: what the cook entered, else the menu price captured when the request was made.
        Integer chosen = body != null && body.pricePerServing() != null
                ? body.pricePerServing() : r.getPricePerServing();
        if (chosen == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a price per serving.");
        }
        int price = chosen;
        org.smartgurukul.swadesi.menu.MenuItem item = r.getMenuItemId() == null
                ? null : menu.findById(r.getMenuItemId()).orElse(null);

        Listing l = new Listing();
        l.setId(UUID.randomUUID());
        l.setCookId(cook.getId());
        l.setCookName(cook.getName());
        l.setTitle(r.getDishName());
        l.setDescription("Requested by " + (r.getConsumerName() == null ? "a customer" : r.getConsumerName()));
        l.setPricePerServing(price);
        l.setMaxServings(r.getQty());
        l.setServingsClaimed(0);
        l.setStatus("open");
        l.setFoodType(item != null ? item.getFoodType() : "veg");
        l.setRequestOnly(true);
        ListingController.applyKitchenOrSocietyPickup(l, cook);
        l.setCreatedAt(now);
        l.setUpdatedAt(now);
        listings.save(l);

        r.setStatus("accepted");
        r.setPricePerServing(price);
        r.setListingId(l.getId());
        r.setUpdatedAt(now);
        DishRequest saved = requests.save(r);
        int total = price * r.getQty();
        push.notifyUsers(List.of(r.getConsumerId()), "Request accepted ✅",
                cook.getName() + " will make " + r.getDishName() + " — pay ₹" + total + " to confirm", "/");
        return toResponse(saved);
    }

    /** Cook rejects a request. */
    @PostMapping("/{id}/reject")
    public RequestResponse reject(@AuthenticationPrincipal AuthenticatedUser auth,
                                  @PathVariable UUID id) {
        DishRequest r = requests.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Request not found"));
        if (!r.getCookId().equals(auth.id())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your request");
        }
        if (!"pending".equals(r.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This request is no longer pending.");
        }
        r.setStatus("rejected");
        r.setUpdatedAt(OffsetDateTime.now());
        DishRequest saved = requests.save(r);
        push.notifyUsers(List.of(r.getConsumerId()), "Request declined",
                (r.getCookName() == null ? "The cook" : r.getCookName())
                        + " can't make " + r.getDishName() + " right now", "/");
        return toResponse(saved);
    }

    /** Consumer cancels their own pending request. */
    @PostMapping("/{id}/cancel")
    public RequestResponse cancel(@AuthenticationPrincipal AuthenticatedUser auth,
                                  @PathVariable UUID id) {
        DishRequest r = requests.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Request not found"));
        if (!r.getConsumerId().equals(auth.id())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your request");
        }
        if (!"pending".equals(r.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only a pending request can be cancelled.");
        }
        r.setStatus("cancelled");
        r.setUpdatedAt(OffsetDateTime.now());
        return toResponse(requests.save(r));
    }

    /**
     * Safety net: an accepted request whose listing already has a placed (paid) order is really
     * fulfilled. Repairs requests left "awaiting payment" when a payment was confirmed by a path
     * that didn't close the request.
     */
    private DishRequest closeIfPaid(DishRequest r) {
        if (!"accepted".equals(r.getStatus()) || r.getListingId() == null) return r;
        for (org.smartgurukul.swadesi.order.FoodOrder o
                : orders.findByListingIdInOrderByCreatedAtDesc(List.of(r.getListingId()))) {
            String st = o.getStatus();
            if ("pending_payment".equals(st) || "cancelled".equals(st)) continue;
            r.setStatus("fulfilled");
            r.setOrderId(o.getId());
            r.setUpdatedAt(OffsetDateTime.now());
            return requests.save(r);
        }
        return r;
    }

    private static RequestResponse toResponse(DishRequest r) {
        return new RequestResponse(r.getId().toString(), r.getDishName(), r.getQty(), r.getNote(),
                r.getStatus(), r.getPricePerServing(), r.getCookName(), r.getConsumerName(),
                r.getListingId() == null ? null : r.getListingId().toString(), r.getCreatedAt());
    }
}
