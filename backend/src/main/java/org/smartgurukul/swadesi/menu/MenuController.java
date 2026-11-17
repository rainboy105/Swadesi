package org.smartgurukul.swadesi.menu;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.smartgurukul.swadesi.security.AuthenticatedUser;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** A cook manages the menu of dishes consumers can request. */
@RestController
@RequestMapping("/api/v1/menu")
public class MenuController {

    public record MenuItemBody(
            @NotBlank @Size(max = 20, message = "Dish name can be at most 20 characters.") String name,
            @Size(max = 200, message = "Description can be at most 200 characters.") String description,
            String foodType,
            @Min(0) @Max(100000) Integer pricePerServing,
            Boolean available) {}

    public record MenuItemView(String id, String name, String description, String foodType,
                               Integer pricePerServing, boolean available, boolean hasPhoto,
                               OffsetDateTime createdAt) {}

    private final MenuItemRepository menu;
    private final MenuPhotoRepository photos;
    private final org.smartgurukul.swadesi.request.DishRequestRepository requests;
    private final org.smartgurukul.swadesi.listing.ListingRepository listings;
    private final org.smartgurukul.swadesi.push.PushService push;

    public MenuController(MenuItemRepository menu, MenuPhotoRepository photos,
                          org.smartgurukul.swadesi.request.DishRequestRepository requests,
                          org.smartgurukul.swadesi.listing.ListingRepository listings,
                          org.smartgurukul.swadesi.push.PushService push) {
        this.menu = menu;
        this.photos = photos;
        this.requests = requests;
        this.listings = listings;
        this.push = push;
    }

    private static String normalizeFoodType(String ft) {
        return "nonveg".equalsIgnoreCase(ft) ? "nonveg" : "veg";
    }

    public static MenuItemView toView(MenuItem m) {
        return new MenuItemView(m.getId().toString(), m.getName(), m.getDescription(), m.getFoodType(),
                m.getPricePerServing(), m.isAvailable(), m.isHasPhoto(), m.getCreatedAt());
    }

    /** The cook's own full menu (available and hidden items). */
    @GetMapping("/mine")
    public List<MenuItemView> mine(@AuthenticationPrincipal AuthenticatedUser auth) {
        return menu.findByCookIdOrderByCreatedAtDesc(auth.id()).stream().map(MenuController::toView).toList();
    }

    @PostMapping
    public MenuItemView create(@AuthenticationPrincipal AuthenticatedUser auth,
                               @Valid @RequestBody MenuItemBody body) {
        OffsetDateTime now = OffsetDateTime.now();
        MenuItem m = new MenuItem();
        m.setId(UUID.randomUUID());
        m.setCookId(auth.id());
        apply(m, body);
        m.setCreatedAt(now);
        m.setUpdatedAt(now);
        return toView(menu.save(m));
    }

    @PutMapping("/{id}")
    public MenuItemView update(@AuthenticationPrincipal AuthenticatedUser auth,
                               @PathVariable UUID id,
                               @Valid @RequestBody MenuItemBody body) {
        MenuItem m = owned(auth, id);
        apply(m, body);
        m.setUpdatedAt(OffsetDateTime.now());
        return toView(menu.save(m));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthenticatedUser auth, @PathVariable UUID id) {
        MenuItem item = owned(auth, id);
        cancelUnpaidRequests(item);
        menu.delete(item);
    }

    /**
     * The dish is leaving the menu, so requests for it that aren't paid yet (waiting for the
     * cook, or accepted but unpaid) are cancelled and the customers told. Paid requests are
     * already orders and are left alone.
     */
    private void cancelUnpaidRequests(MenuItem item) {
        OffsetDateTime now = OffsetDateTime.now();
        for (org.smartgurukul.swadesi.request.DishRequest r
                : requests.findByMenuItemIdAndStatusIn(item.getId(), List.of("pending", "accepted"))) {
            if (r.getListingId() != null) {
                listings.findById(r.getListingId()).ifPresent(l -> {
                    l.setStatus("closed");
                    l.setUpdatedAt(now);
                    listings.save(l);
                });
            }
            r.setStatus("cancelled");
            r.setUpdatedAt(now);
            requests.save(r);
            push.notifyUsers(List.of(r.getConsumerId()), "Request cancelled",
                    r.getDishName() + " is no longer on the menu, so your request was cancelled.", "/");
        }
    }

    /** Cook uploads (or replaces) a menu item's photo. Stored as bytes; served publicly. */
    @PostMapping("/{id}/photo")
    public MenuItemView uploadPhoto(@AuthenticationPrincipal AuthenticatedUser auth,
                                    @PathVariable UUID id,
                                    @org.springframework.web.bind.annotation.RequestParam("file")
                                    org.springframework.web.multipart.MultipartFile file) {
        MenuItem m = owned(auth, id);
        String ct = file.getContentType();
        if (ct == null || !ct.startsWith("image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please upload an image");
        }
        if (file.getSize() > 5_000_000) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Image too large (max 5 MB)");
        }
        try {
            MenuPhoto p = photos.findById(id).orElseGet(MenuPhoto::new);
            p.setMenuItemId(id);
            p.setData(file.getBytes());
            p.setContentType(ct);
            p.setCreatedAt(OffsetDateTime.now());
            photos.save(p);
        } catch (java.io.IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read the image");
        }
        m.setHasPhoto(true);
        m.setUpdatedAt(OffsetDateTime.now());
        return toView(menu.save(m));
    }

    private MenuItem owned(AuthenticatedUser auth, UUID id) {
        MenuItem m = menu.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Menu item not found"));
        if (!m.getCookId().equals(auth.id())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your menu item");
        }
        return m;
    }

    private static void apply(MenuItem m, MenuItemBody body) {
        m.setName(body.name().trim());
        m.setDescription(body.description() == null || body.description().isBlank()
                ? null : body.description().trim());
        m.setFoodType(normalizeFoodType(body.foodType()));
        m.setPricePerServing(body.pricePerServing());
        m.setAvailable(body.available() == null || body.available());
    }
}
