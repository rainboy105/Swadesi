package org.smartgurukul.swadesi.request;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.smartgurukul.swadesi.listing.Listing;
import org.smartgurukul.swadesi.listing.ListingController;
import org.smartgurukul.swadesi.listing.ListingRepository;
import org.smartgurukul.swadesi.security.AuthenticatedUser;
import org.smartgurukul.swadesi.user.User;
import org.smartgurukul.swadesi.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** "Cooks near you": discover cooks within range and browse their past dishes. */
@RestController
@RequestMapping("/api/v1/cooks")
public class CookDirectoryController {

    /** Same range as the new-dish push notifications. */
    private static final double RANGE_METERS = 10000;

    public record CookNearby(String cookId, String cookName, int distanceMeters, int dishCount) {}

    public record CookListingItem(String id, String title, String description, int pricePerServing,
                                  String foodType, boolean hasPhoto, String status, boolean expired,
                                  OffsetDateTime createdAt) {}

    public record CookProfile(String cookId, String cookName, Integer distanceMeters,
                              List<CookListingItem> dishes) {}

    private final ListingRepository listings;
    private final UserRepository users;

    public CookDirectoryController(ListingRepository listings, UserRepository users) {
        this.listings = listings;
        this.users = users;
    }

    /** Cooks within 10 km of the viewer who have at least one public listing. */
    @GetMapping("/nearby")
    public List<CookNearby> nearby(@AuthenticationPrincipal AuthenticatedUser auth) {
        User me = users.findById(auth.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        if (me.getLat() == null || me.getLng() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Set your location first.");
        }
        double lat = me.getLat(), lng = me.getLng();
        double latDelta = RANGE_METERS / 111_320.0;
        double lngDelta = RANGE_METERS / (111_320.0 * Math.cos(Math.toRadians(lat)));

        List<CookNearby> out = new ArrayList<>();
        for (UUID cookId : listings.findCookIdsInBox(me.getId(),
                lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta)) {
            List<Listing> dishes = listings.findByCookIdAndRequestOnlyFalseOrderByCreatedAtDesc(cookId);
            if (dishes.isEmpty()) continue;
            // Distance to the cook's nearest listing location.
            double best = Double.MAX_VALUE;
            for (Listing d : dishes) {
                best = Math.min(best, ListingController.haversineMeters(lat, lng, d.getLat(), d.getLng()));
            }
            if (best > RANGE_METERS) continue;
            User cook = users.findById(cookId).orElse(null);
            String name = cook != null && cook.getName() != null ? cook.getName() : "A home cook";
            out.add(new CookNearby(cookId.toString(), name, (int) Math.round(best), dishes.size()));
        }
        out.sort(Comparator.comparingInt(CookNearby::distanceMeters));
        return out;
    }

    /** A cook's public menu history (past dishes). */
    @GetMapping("/{cookId}")
    public CookProfile profile(@AuthenticationPrincipal AuthenticatedUser auth,
                               @PathVariable UUID cookId) {
        User cook = users.findById(cookId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Cook not found"));
        User me = users.findById(auth.id()).orElse(null);
        OffsetDateTime now = OffsetDateTime.now();
        List<CookListingItem> dishes = new ArrayList<>();
        Integer dist = null;
        for (Listing l : listings.findByCookIdAndRequestOnlyFalseOrderByCreatedAtDesc(cookId)) {
            boolean expired = l.getOrderBy() != null && !l.getOrderBy().isAfter(now);
            dishes.add(new CookListingItem(l.getId().toString(), l.getTitle(), l.getDescription(),
                    l.getPricePerServing(), l.getFoodType(), l.isHasPhoto(), l.getStatus(), expired,
                    l.getCreatedAt()));
            if (dist == null && me != null && me.getLat() != null && me.getLng() != null) {
                dist = (int) Math.round(
                        ListingController.haversineMeters(me.getLat(), me.getLng(), l.getLat(), l.getLng()));
            }
        }
        String name = cook.getName() != null ? cook.getName() : "A home cook";
        return new CookProfile(cookId.toString(), name, dist, dishes);
    }
}
