package org.smartgurukul.swadesi.request;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DishRequestRepository extends JpaRepository<DishRequest, UUID> {
    List<DishRequest> findByConsumerIdOrderByCreatedAtDesc(UUID consumerId);
    List<DishRequest> findByCookIdOrderByCreatedAtDesc(UUID cookId);
    Optional<DishRequest> findByListingId(UUID listingId);

    /** Requests raised from one menu item that are in any of the given statuses. */
    List<DishRequest> findByMenuItemIdAndStatusIn(UUID menuItemId, java.util.Collection<String> statuses);
}
