package org.smartgurukul.swadesi.listing;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ListingRepository extends JpaRepository<Listing, UUID> {

    List<Listing> findByCookIdOrderByCreatedAtDesc(UUID cookId);

    /**
     * Open listings with servings left and not past their order cutoff, inside a lat/lng
     * bounding box, excluding the viewer's own. The box is a cheap prefilter; the controller
     * does the exact Haversine distance.
     */
    @Query("""
            select l from Listing l
            where l.status = 'open'
              and l.servingsClaimed < l.maxServings
              and l.cookId <> :viewer
              and (l.orderBy is null or l.orderBy > :now)
              and l.lat between :minLat and :maxLat
              and l.lng between :minLng and :maxLng
            """)
    List<Listing> findOpenInBox(@Param("viewer") UUID viewer, @Param("now") OffsetDateTime now,
                                @Param("minLat") double minLat, @Param("maxLat") double maxLat,
                                @Param("minLng") double minLng, @Param("maxLng") double maxLng);

    /**
     * Atomically claim {@code qty} servings: succeeds (returns 1) only if the listing is open,
     * not past its cutoff, and has enough left. This is the oversell guard.
     */
    @Modifying
    @Query("""
            update Listing l set l.servingsClaimed = l.servingsClaimed + :qty, l.updatedAt = :now
            where l.id = :id
              and l.status = 'open'
              and l.servingsClaimed + :qty <= l.maxServings
              and (l.orderBy is null or l.orderBy > :now)
            """)
    int claim(@Param("id") UUID id, @Param("qty") int qty, @Param("now") OffsetDateTime now);

    /** Release servings (order rejected/cancelled). */
    @Modifying
    @Query("""
            update Listing l set l.servingsClaimed = l.servingsClaimed - :qty, l.updatedAt = :now
            where l.id = :id and l.servingsClaimed >= :qty
            """)
    int release(@Param("id") UUID id, @Param("qty") int qty, @Param("now") OffsetDateTime now);
}
