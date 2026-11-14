package org.smartgurukul.swadesi.admin;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.smartgurukul.swadesi.listing.Listing;
import org.smartgurukul.swadesi.listing.ListingRepository;
import org.smartgurukul.swadesi.order.FoodOrder;
import org.smartgurukul.swadesi.order.FoodOrderRepository;
import org.smartgurukul.swadesi.security.AuthenticatedUser;
import org.smartgurukul.swadesi.user.User;
import org.smartgurukul.swadesi.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Admin settlement view: completed, paid orders whose money is still owed to the cook. The
 * platform pays each cook by UPI manually, then marks the order settled. Admin-only
 * (SecurityConfig restricts /api/v1/admin/** to ROLE_ADMIN).
 */
@RestController
@RequestMapping("/api/v1/admin/settlements")
public class AdminSettlementController {

    public record Settlement(String orderId, String dish, int qty, String cookName, String cookUpi,
                             int amountPaise, OffsetDateTime completedAt) {}

    public record SettlementList(List<Settlement> pending, int totalOwedPaise) {}

    private final FoodOrderRepository orders;
    private final ListingRepository listings;
    private final UserRepository users;

    public AdminSettlementController(FoodOrderRepository orders, ListingRepository listings,
                                     UserRepository users) {
        this.orders = orders;
        this.listings = listings;
        this.users = users;
    }

    /** Completed+paid orders not yet settled to the cook. */
    @GetMapping
    public SettlementList pending() {
        List<Settlement> rows = new ArrayList<>();
        int total = 0;
        for (FoodOrder o : orders.findByStatusAndPaidAndCookPaidOutOrderByUpdatedAtDesc("completed", true, false)) {
            Listing l = listings.findById(o.getListingId()).orElse(null);
            User cook = l == null ? null : users.findById(l.getCookId()).orElse(null);
            int amt = o.getAmountPaise() == null ? 0 : o.getAmountPaise();
            total += amt;
            rows.add(new Settlement(o.getId().toString(),
                    l == null ? "(dish)" : l.getTitle(), o.getQty(),
                    cook == null ? null : cook.getName(),
                    cook == null ? null : cook.getUpiId(),
                    amt, o.getUpdatedAt()));
        }
        return new SettlementList(rows, total);
    }

    /** Mark one order as paid out to the cook (after you've sent the UPI transfer). */
    @PostMapping("/{id}/mark-paid-out")
    public void markPaidOut(@AuthenticationPrincipal AuthenticatedUser auth, @PathVariable UUID id) {
        FoodOrder o = orders.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found"));
        o.setCookPaidOut(true);
        o.setCookPaidOutAt(OffsetDateTime.now());
        orders.save(o);
    }
}
