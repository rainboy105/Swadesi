package org.smartgurukul.swadesi.user;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByPhone(String phone);

    /** Users (excluding one id) whose saved location falls inside a lat/lng bounding box. */
    @Query("""
            select u from User u
            where u.id <> :excludeId
              and u.lat is not null and u.lng is not null
              and u.lat between :minLat and :maxLat
              and u.lng between :minLng and :maxLng
            """)
    List<User> findInBox(@Param("excludeId") UUID excludeId,
                         @Param("minLat") double minLat, @Param("maxLat") double maxLat,
                         @Param("minLng") double minLng, @Param("maxLng") double maxLng);
}
