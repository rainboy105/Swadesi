package org.smartgurukul.swadesi.listing;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.io.IOException;
import org.smartgurukul.swadesi.security.AuthenticatedUser;
import org.smartgurukul.swadesi.user.User;
import org.smartgurukul.swadesi.user.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/listings")
public class ListingController {

    public record CreateRequest(
            @NotBlank @Size(max = 20, message = "Dish name can be at most 20 characters.") String title,
            @Size(max = 200, message = "Description can be at most 200 characters.") String description,
            @Min(0) @Max(100000) int pricePerServing,
            @Min(1) @Max(500) int maxServings,
            OffsetDateTime readyBy,
            OffsetDateTime orderBy,
            OffsetDateTime availableFrom,
            String foodType,
            Double pickupLat,
            Double pickupLng,
            @Size(max = 300) String pickupAddress) {}

    /** Create a listing straight from a saved menu item: only the time window + servings are new. */
    public record FromMenuRequest(
            OffsetDateTime availableFrom,
            OffsetDateTime orderBy,
            @Min(1) @Max(500) int maxServings) {}

    /** A listing as its own cook sees it. {@code expired} = past its order cutoff. */
    public record ListingResponse(String id, String title, String description, int pricePerServing,
                                  int maxServings, int remaining, OffsetDateTime readyBy,
                                  OffsetDateTime orderBy, OffsetDateTime availableFrom, String status,
                                  String foodType, boolean hasPhoto, boolean expired,
                                  double pickupLat, double pickupLng,
                                  String pickupAddress, OffsetDateTime createdAt) {}

    /** A listing in the consumer's vicinity feed, with cook name and distance. */
    public record FeedItem(String id, String title, String description, int pricePerServing,
                           int remaining, OffsetDateTime readyBy, OffsetDateTime orderBy,
                           String cookName, int distanceMeters, boolean hasPhoto, String foodType) {}

    /** Fixed range for "new dish nearby" push notifications, regardless of each user's feed radius. */
    private static final double NOTIFY_RADIUS_METERS = 5000;

    private final ListingRepository listings;
    private final ListingPhotoRepository photos;
    private final UserRepository users;
    private final org.smartgurukul.swadesi.push.PushService push;
    private final org.smartgurukul.swadesi.menu.MenuItemRepository menuItems;
    private final org.smartgurukul.swadesi.menu.MenuPhotoRepository menuPhotos;
    private final double radiusMeters;

    public ListingController(ListingRepository listings, ListingPhotoRepository photos,
                             UserRepository users,
                             org.smartgurukul.swadesi.push.PushService push,
                             org.smartgurukul.swadesi.menu.MenuItemRepository menuItems,
                             org.smartgurukul.swadesi.menu.MenuPhotoRepository menuPhotos,
                             @Value("${swadesi.vicinity.radius-meters:500}") double radiusMeters) {
        this.listings = listings;
        this.photos = photos;
        this.users = users;
        this.push = push;
        this.menuItems = menuItems;
        this.menuPhotos = menuPhotos;
        this.radiusMeters = radiusMeters;
    }

    /**
     * Cook lists a saved menu item for a time window — no re-typing the dish. Copies the item's
     * name, description, food type, price and photo; the cook supplies only opening/ending time
     * and servings.
     */
    @PostMapping("/from-menu/{menuItemId}")
    public ListingResponse listFromMenu(@AuthenticationPrincipal AuthenticatedUser auth,
                                        @PathVariable UUID menuItemId,
                                        @Valid @RequestBody FromMenuRequest req) {
        User cook = users.findById(auth.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        org.smartgurukul.swadesi.menu.MenuItem item = menuItems.findById(menuItemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Menu item not found"));
        if (!item.getCookId().equals(cook.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your menu item");
        }
        OffsetDateTime now = OffsetDateTime.now();
        if (req.orderBy() == null || !req.orderBy().isAfter(now)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Set an ending (order-by) time in the future.");
        }
        if (req.availableFrom() != null && req.orderBy().isBefore(req.availableFrom())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ending time must be after the opening time.");
        }
        if (item.getPricePerServing() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Add a price to this menu item before listing it.");
        }

        Listing l = new Listing();
        l.setId(UUID.randomUUID());
        l.setCookId(cook.getId());
        l.setCookName(cook.getName());
        l.setTitle(item.getName());
        l.setDescription(item.getDescription());
        l.setPricePerServing(item.getPricePerServing());
        l.setMaxServings(req.maxServings());
        l.setServingsClaimed(0);
        l.setOrderBy(req.orderBy());
        l.setAvailableFrom(req.availableFrom());
        l.setFoodType(item.getFoodType());
        l.setStatus("open");
        applyKitchenOrSocietyPickup(l, cook);
        l.setCreatedAt(now);
        l.setUpdatedAt(now);

        // Copy the menu item's photo onto the listing, if it has one.
        if (item.isHasPhoto()) {
            menuPhotos.findById(item.getId()).ifPresent(mp -> {
                ListingPhoto lp = new ListingPhoto();
                lp.setListingId(l.getId());
                lp.setData(mp.getData());
                lp.setContentType(mp.getContentType());
                lp.setCreatedAt(now);
                photos.save(lp);
                l.setHasPhoto(true);
            });
        }
        Listing saved = listings.save(l);
        if (isOpenNow(saved, now)) notifyNearbyConsumers(saved, cook);
        return toResponse(saved);
    }

    /** Cook uploads (or replaces) the dish photo. Stored as bytes; served publicly. */
    @PostMapping("/{id}/photo")
    public ListingResponse uploadPhoto(@AuthenticationPrincipal AuthenticatedUser auth,
                                       @PathVariable UUID id,
                                       @RequestParam("file") MultipartFile file) {
        Listing l = listings.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Listing not found"));
        if (!l.getCookId().equals(auth.id())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your listing");
        }
        String ct = file.getContentType();
        if (ct == null || !ct.startsWith("image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please upload an image");
        }
        if (file.getSize() > 5_000_000) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Image too large (max 5 MB)");
        }
        try {
            ListingPhoto p = photos.findById(id).orElseGet(ListingPhoto::new);
            p.setListingId(id);
            p.setData(file.getBytes());
            p.setContentType(ct);
            p.setCreatedAt(OffsetDateTime.now());
            photos.save(p);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read the image");
        }
        l.setHasPhoto(true);
        l.setUpdatedAt(OffsetDateTime.now());
        return toResponse(listings.save(l));
    }

    /** Cook creates a listing. Its location is snapshotted from the cook's profile. */
    @PostMapping
    public ListingResponse create(@AuthenticationPrincipal AuthenticatedUser auth,
                                  @Valid @RequestBody CreateRequest req) {
        User cook = users.findById(auth.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        OffsetDateTime now = OffsetDateTime.now();
        if (req.orderBy() != null && !req.orderBy().isAfter(now)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Order-by time must be in the future.");
        }
        Listing l = new Listing();
        l.setId(UUID.randomUUID());
        l.setCookId(cook.getId());
        l.setCookName(cook.getName());
        l.setTitle(req.title().trim());
        l.setDescription(req.description() == null ? null : req.description().trim());
        l.setPricePerServing(req.pricePerServing());
        l.setMaxServings(req.maxServings());
        l.setServingsClaimed(0);
        l.setReadyBy(req.readyBy());
        l.setOrderBy(req.orderBy());
        l.setAvailableFrom(req.availableFrom());
        l.setFoodType(normalizeFoodType(req.foodType()));
        l.setStatus("open");
        applyPickup(l, cook, req);
        l.setCreatedAt(now);
        l.setUpdatedAt(now);
        Listing saved = listings.save(l);
        if (isOpenNow(saved, now)) notifyNearbyConsumers(saved, cook);
        return toResponse(saved);
    }

    /** Push "new dish nearby" to every user within 5 km of the dish (except the cook). */
    private void notifyNearbyConsumers(Listing l, User cook) {
        try {
            double lat = l.getLat();
            double lng = l.getLng();
            double latDelta = NOTIFY_RADIUS_METERS / 111_320.0;
            double lngDelta = NOTIFY_RADIUS_METERS / (111_320.0 * Math.cos(Math.toRadians(lat)));
            List<UUID> targets = new ArrayList<>();
            for (User u : users.findInBox(cook.getId(),
                    lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta)) {
                if (haversineMeters(lat, lng, u.getLat(), u.getLng()) <= NOTIFY_RADIUS_METERS) {
                    targets.add(u.getId());
                }
            }
            if (!targets.isEmpty()) {
                String cookName = cook.getName() == null ? "A home cook" : cook.getName();
                push.notifyUsers(targets, "New dish near you 🍲",
                        cookName + " just listed " + l.getTitle(), "/");
            }
        } catch (Exception e) {
            // Never let a notification failure break listing creation.
        }
    }

    /** A single dish by id, for the share deep-link. Viewable by any logged-in user. */
    public record DishDetail(String id, String title, String description, int pricePerServing,
                             int remaining, int maxServings, OffsetDateTime orderBy, String status,
                             String foodType, boolean hasPhoto, boolean expired, String cookName,
                             Integer distanceMeters, String pickupAddress) {}

    @GetMapping("/{id}")
    public DishDetail one(@AuthenticationPrincipal AuthenticatedUser auth, @PathVariable UUID id) {
        Listing l = listings.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Dish not found"));
        Integer dist = null;
        User me = users.findById(auth.id()).orElse(null);
        if (me != null && me.getLat() != null && me.getLng() != null) {
            dist = (int) Math.round(haversineMeters(me.getLat(), me.getLng(), l.getLat(), l.getLng()));
        }
        return new DishDetail(l.getId().toString(), l.getTitle(), l.getDescription(),
                l.getPricePerServing(), l.remaining(), l.getMaxServings(), l.getOrderBy(),
                l.getStatus(), l.getFoodType(), l.isHasPhoto(), isExpired(l), l.getCookName(),
                dist, l.getPickupAddress());
    }

    /** The cook's own listings. */
    @GetMapping("/mine")
    public List<ListingResponse> mine(@AuthenticationPrincipal AuthenticatedUser auth) {
        return listings.findByCookIdOrderByCreatedAtDesc(auth.id()).stream()
                .map(ListingController::toResponse).toList();
    }

    /** Close (or reopen) one of the cook's own listings. A listing past its cutoff can't reopen. */
    @PostMapping("/{id}/status")
    public ListingResponse setStatus(@AuthenticationPrincipal AuthenticatedUser auth,
                                     @PathVariable UUID id,
                                     @RequestBody StatusRequest req) {
        Listing l = listings.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Listing not found"));
        if (!l.getCookId().equals(auth.id())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your listing");
        }
        String s = req.status() == null ? "" : req.status().trim().toLowerCase();
        if (!s.equals("open") && !s.equals("closed")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "status must be 'open' or 'closed'");
        }
        if (s.equals("open") && isExpired(l)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "The order time has passed — this dish can't be reopened. Create a new listing.");
        }
        l.setStatus(s);
        l.setUpdatedAt(OffsetDateTime.now());
        return toResponse(listings.save(l));
    }

    /** Edit one of the cook's own listings. Max servings can't drop below what's already claimed. */
    @org.springframework.web.bind.annotation.PutMapping("/{id}")
    public ListingResponse update(@AuthenticationPrincipal AuthenticatedUser auth,
                                  @PathVariable UUID id,
                                  @Valid @RequestBody CreateRequest req) {
        Listing l = listings.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Listing not found"));
        if (!l.getCookId().equals(auth.id())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your listing");
        }
        if (req.maxServings() < l.getServingsClaimed()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Servings can't be less than the " + l.getServingsClaimed() + " already ordered");
        }
        if (req.orderBy() != null && !req.orderBy().isAfter(OffsetDateTime.now())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Order-by time must be in the future.");
        }
        l.setTitle(req.title().trim());
        l.setDescription(req.description() == null ? null : req.description().trim());
        l.setPricePerServing(req.pricePerServing());
        l.setMaxServings(req.maxServings());
        l.setReadyBy(req.readyBy());
        l.setOrderBy(req.orderBy());
        l.setAvailableFrom(req.availableFrom());
        l.setFoodType(normalizeFoodType(req.foodType()));
        User cook = users.findById(auth.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        applyPickup(l, cook, req);
        l.setUpdatedAt(OffsetDateTime.now());
        return toResponse(listings.save(l));
    }

    /**
     * Resolve a listing's pickup location: the per-dish override if the form sent one, else the
     * cook's saved kitchen, else their society/home. Fails only if none of the three is set.
     */
    private static void applyPickup(Listing l, User cook, CreateRequest req) {
        if (req.pickupLat() != null && req.pickupLng() != null) {
            l.setLat(req.pickupLat());
            l.setLng(req.pickupLng());
            l.setPickupAddress(req.pickupAddress() == null ? null : req.pickupAddress().trim());
        } else {
            applyKitchenOrSocietyPickup(l, cook);
        }
    }

    /**
     * Set a listing's pickup to the cook's saved kitchen, else their society/home. Fails if
     * neither is set. Reused when creating a one-off listing to fulfil a dish request.
     */
    public static void applyKitchenOrSocietyPickup(Listing l, User cook) {
        if (cook.getKitchenLat() != null && cook.getKitchenLng() != null) {
            l.setLat(cook.getKitchenLat());
            l.setLng(cook.getKitchenLng());
            l.setPickupAddress(cook.getKitchenAddress());
        } else if (cook.getLat() != null && cook.getLng() != null) {
            l.setLat(cook.getLat());
            l.setLng(cook.getLng());
            l.setPickupAddress(cook.getAddressText());
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Set a pickup location (kitchen address) before accepting requests.");
        }
    }

    /** Normalize the food type to "veg" or "nonveg"; default "veg". */
    private static String normalizeFoodType(String ft) {
        return ft != null && ft.trim().equalsIgnoreCase("nonveg") ? "nonveg" : "veg";
    }

    public record StatusRequest(String status) {}

    private static boolean isExpired(Listing l) {
        return l.getOrderBy() != null && !l.getOrderBy().isAfter(OffsetDateTime.now());
    }

    /** Open to consumers right now: past its opening time (if any) and not past its cutoff. */
    private static boolean isOpenNow(Listing l, OffsetDateTime now) {
        boolean opened = l.getAvailableFrom() == null || !l.getAvailableFrom().isAfter(now);
        boolean notClosed = l.getOrderBy() == null || l.getOrderBy().isAfter(now);
        return opened && notClosed;
    }

    /** The vicinity feed: open listings within the radius of the viewer's location. */
    @GetMapping("/nearby")
    public List<FeedItem> nearby(@AuthenticationPrincipal AuthenticatedUser auth) {
        User me = users.findById(auth.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        if (me.getLat() == null || me.getLng() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Set your location first.");
        }
        double lat = me.getLat();
        double lng = me.getLng();
        // The consumer's own radius (falls back to the global default if unset).
        double radius = me.getSearchRadiusM() > 0 ? me.getSearchRadiusM() : radiusMeters;
        // Bounding box prefilter (degrees per metre), then exact Haversine.
        double latDelta = radius / 111_320.0;
        double lngDelta = radius / (111_320.0 * Math.cos(Math.toRadians(lat)));

        List<FeedItem> out = new ArrayList<>();
        for (Listing l : listings.findOpenInBox(me.getId(), OffsetDateTime.now(),
                lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta)) {
            double d = haversineMeters(lat, lng, l.getLat(), l.getLng());
            if (d <= radius) {
                out.add(new FeedItem(l.getId().toString(), l.getTitle(), l.getDescription(),
                        l.getPricePerServing(), l.remaining(), l.getReadyBy(), l.getOrderBy(),
                        l.getCookName(), (int) Math.round(d), l.isHasPhoto(), l.getFoodType()));
            }
        }
        out.sort(Comparator.comparingInt(FeedItem::distanceMeters));
        return out;
    }

    private static ListingResponse toResponse(Listing l) {
        return new ListingResponse(l.getId().toString(), l.getTitle(), l.getDescription(),
                l.getPricePerServing(), l.getMaxServings(), l.remaining(), l.getReadyBy(),
                l.getOrderBy(), l.getAvailableFrom(), l.getStatus(), l.getFoodType(), l.isHasPhoto(),
                isExpired(l), l.getLat(), l.getLng(), l.getPickupAddress(), l.getCreatedAt());
    }

    public static double haversineMeters(double lat1, double lon1, double lat2, double lon2) {
        double R = 6_371_000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}
