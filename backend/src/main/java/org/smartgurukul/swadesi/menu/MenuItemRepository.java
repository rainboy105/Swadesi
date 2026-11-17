package org.smartgurukul.swadesi.menu;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MenuItemRepository extends JpaRepository<MenuItem, UUID> {

    /** A cook's whole menu, newest first (for the cook's own management view). */
    List<MenuItem> findByCookIdOrderByCreatedAtDesc(UUID cookId);

    /** Only the items a cook currently offers (for consumers browsing the profile). */
    List<MenuItem> findByCookIdAndAvailableTrueOrderByCreatedAtDesc(UUID cookId);

    /** Distinct cook ids that have at least one menu item — used to widen "cooks near you". */
    @org.springframework.data.jpa.repository.Query("select distinct m.cookId from MenuItem m where m.available = true")
    List<UUID> findCookIdsWithMenu();

    long countByCookIdAndAvailableTrue(UUID cookId);
}
