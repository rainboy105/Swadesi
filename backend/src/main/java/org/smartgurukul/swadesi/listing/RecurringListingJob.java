package org.smartgurukul.swadesi.listing;

import java.time.OffsetDateTime;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.smartgurukul.swadesi.user.UserRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Re-lists "repeat daily" dishes. A recurring listing is copied once a day at the time of day it
 * was first listed: same dish, price, servings and pickup, with the order-by time moved to the
 * new day. The recurring flag moves to the newest copy, so each day is listed exactly once.
 * Closing today's listing does not stop the repeat; unticking "Repeat daily" does.
 */
@Component
public class RecurringListingJob {

    private static final Logger log = LoggerFactory.getLogger(RecurringListingJob.class);

    private final ListingRepository listings;
    private final ListingPhotoRepository photos;
    private final UserRepository users;
    private final ListingController listingController;

    public RecurringListingJob(ListingRepository listings, ListingPhotoRepository photos,
                               UserRepository users, ListingController listingController) {
        this.listings = listings;
        this.photos = photos;
        this.users = users;
        this.listingController = listingController;
    }

    @Scheduled(initialDelay = 60_000, fixedDelay = 120_000)
    @Transactional
    public void relistDue() {
        OffsetDateTime now = OffsetDateTime.now();
        for (Listing src : listings.findByRecurringTrueAndRequestOnlyFalse()) {
            try {
                relistIfDue(src, now);
            } catch (Exception e) {
                log.warn("recurring relist failed for listing {}: {}", src.getId(), e.toString());
            }
        }
    }

    private void relistIfDue(Listing src, OffsetDateTime now) {
        // Find the day (k days after the original) whose listing time has arrived and whose
        // order window is still open. Skips days missed entirely (e.g. while the server was down).
        long k = 1;
        while (src.getOrderBy() != null && !src.getOrderBy().plusDays(k).isAfter(now)) k++;
        OffsetDateTime listAt = src.getCreatedAt().plusDays(k);
        if (listAt.isAfter(now)) return; // not time yet

        Listing l = new Listing();
        l.setId(UUID.randomUUID());
        l.setCookId(src.getCookId());
        l.setCookName(src.getCookName());
        l.setTitle(src.getTitle());
        l.setDescription(src.getDescription());
        l.setPricePerServing(src.getPricePerServing());
        l.setMaxServings(src.getMaxServings());
        l.setServingsClaimed(0);
        l.setReadyBy(src.getReadyBy() == null ? null : src.getReadyBy().plusDays(k));
        l.setOrderBy(src.getOrderBy() == null ? null : src.getOrderBy().plusDays(k));
        l.setFoodType(src.getFoodType());
        l.setStatus("open");
        l.setLat(src.getLat());
        l.setLng(src.getLng());
        l.setPickupAddress(src.getPickupAddress());
        l.setRecurring(true);
        l.setCreatedAt(listAt);
        l.setUpdatedAt(now);

        if (src.isHasPhoto()) {
            photos.findById(src.getId()).ifPresent(sp -> {
                ListingPhoto p = new ListingPhoto();
                p.setListingId(l.getId());
                p.setData(sp.getData());
                p.setContentType(sp.getContentType());
                p.setCreatedAt(now);
                photos.save(p);
                l.setHasPhoto(true);
            });
        }

        // Hand the repeat on to the new copy so the old one is never copied again.
        src.setRecurring(false);
        src.setUpdatedAt(now);
        listings.save(src);
        Listing saved = listings.save(l);
        log.info("recurring: re-listed '{}' for cook {}", saved.getTitle(), saved.getCookId());
        users.findById(saved.getCookId()).ifPresent(cook -> listingController.notifyNearbyConsumers(saved, cook));
    }
}
