package org.smartgurukul.swadesi.push;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

public interface PushSubscriptionRepository extends JpaRepository<PushSubscription, UUID> {
    Optional<PushSubscription> findByEndpoint(String endpoint);

    List<PushSubscription> findByUserIdIn(Collection<UUID> userIds);

    @Transactional
    void deleteByEndpoint(String endpoint);
}
