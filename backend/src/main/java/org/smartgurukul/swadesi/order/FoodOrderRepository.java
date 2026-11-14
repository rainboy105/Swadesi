package org.smartgurukul.swadesi.order;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FoodOrderRepository extends JpaRepository<FoodOrder, UUID> {

    List<FoodOrder> findByConsumerIdOrderByCreatedAtDesc(UUID consumerId);

    List<FoodOrder> findByListingIdInOrderByCreatedAtDesc(Collection<UUID> listingIds);

    Optional<FoodOrder> findByRazorpayOrderId(String razorpayOrderId);

    /** Completed, paid orders not yet settled to the cook (money owed out). */
    List<FoodOrder> findByStatusAndPaidAndCookPaidOutOrderByUpdatedAtDesc(
            String status, boolean paid, boolean cookPaidOut);
}
