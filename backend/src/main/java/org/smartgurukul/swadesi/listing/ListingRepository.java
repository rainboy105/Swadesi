package org.smartgurukul.swadesi.listing;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ListingRepository extends JpaRepository<Listing, UUID> {

    List<Listing> findByCookIdOrderByCreatedAtDesc(UUID cookId);

    /**
     * Open listings with servings left, inside a lat/lng bounding box, excluding the viewer's
     * own. The box is a cheap prefilter; the controller does the exact Haversine distance.
     */
    @Query("""
            select l from Listing l
            where l.status = 'open'
              and l.servingsClaimed < l.maxServings
              and l.cookId <> :viewer
              and l.lat between :minLat and :maxLat
              and l.lng between :minLng and :maxLng
            """)
    List<Listing> findOpenInBox(@Param("viewer") UUID viewer,
                                @Param("minLat") double minLat, @Param("maxLat") double maxLat,
                                @Param("minLng") double minLng, @Param("maxLng") double maxLng);
}
