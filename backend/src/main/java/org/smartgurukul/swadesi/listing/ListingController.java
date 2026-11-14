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
            @NotBlank @Size(max = 120) String title,
            @Size(max = 500) String description,
            @Min(0) @Max(100000) int pricePerServing,
            @Min(1) @Max(500) int maxServings,
            OffsetDateTime readyBy,
            OffsetDateTime orderBy) {}

    /** A listing as its own cook sees it. {@code expired} = past its order cutoff. */
    public record ListingResponse(String id, String title, String description, int pricePerServing,
                                  int maxServings, int remaining, OffsetDateTime readyBy,
                                  OffsetDateTime orderBy, String status, boolean hasPhoto,
                                  boolean expired, OffsetDateTime createdAt) {}

    /** A listing in the consumer's vicinity feed, with cook name and distance. */
    public record FeedItem(String id, String title, String description, int pricePerServing,
                           int remaining, OffsetDateTime readyBy, OffsetDateTime orderBy,
                           String cookName, int distanceMeters, boolean hasPhoto) {}

    private final ListingRepository listings;
    private final ListingPhotoRepository photos;
    private final UserRepository users;
    private final double radiusMeters;

    public ListingController(ListingRepository listings, ListingPhotoRepository photos,
                             UserRepository users,
                             @Value("${swadesi.vicinity.radius-meters:500}") double radiusMeters) {
        this.listings = listings;
        this.photos = photos;
        this.users = users;
        this.radiusMeters = radiusMeters;
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
        if (cook.getLat() == null || cook.getLng() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Set your location first (finish onboarding) before listing food.");
        }
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
        l.setStatus("open");
        l.setLat(cook.getLat());
        l.setLng(cook.getLng());
        l.setCreatedAt(now);
        l.setUpdatedAt(now);
        return toResponse(listings.save(l));
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
        l.setUpdatedAt(OffsetDateTime.now());
        return toResponse(listings.save(l));
    }

    public record StatusRequest(String status) {}

    private static boolean isExpired(Listing l) {
        return l.getOrderBy() != null && !l.getOrderBy().isAfter(OffsetDateTime.now());
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
        // Bounding box prefilter (degrees per metre), then exact Haversine.
        double latDelta = radiusMeters / 111_320.0;
        double lngDelta = radiusMeters / (111_320.0 * Math.cos(Math.toRadians(lat)));

        List<FeedItem> out = new ArrayList<>();
        for (Listing l : listings.findOpenInBox(me.getId(), OffsetDateTime.now(),
                lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta)) {
            double d = haversineMeters(lat, lng, l.getLat(), l.getLng());
            if (d <= radiusMeters) {
                out.add(new FeedItem(l.getId().toString(), l.getTitle(), l.getDescription(),
                        l.getPricePerServing(), l.remaining(), l.getReadyBy(), l.getOrderBy(),
                        l.getCookName(), (int) Math.round(d), l.isHasPhoto()));
            }
        }
        out.sort(Comparator.comparingInt(FeedItem::distanceMeters));
        return out;
    }

    private static ListingResponse toResponse(Listing l) {
        return new ListingResponse(l.getId().toString(), l.getTitle(), l.getDescription(),
                l.getPricePerServing(), l.getMaxServings(), l.remaining(), l.getReadyBy(),
                l.getOrderBy(), l.getStatus(), l.isHasPhoto(), isExpired(l), l.getCreatedAt());
    }

    private static double haversineMeters(double lat1, double lon1, double lat2, double lon2) {
        double R = 6_371_000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}
