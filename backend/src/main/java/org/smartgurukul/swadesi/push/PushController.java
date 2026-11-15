package org.smartgurukul.swadesi.push;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
import org.smartgurukul.swadesi.security.AuthenticatedUser;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PushController {

    public record SubscribeRequest(
            @NotBlank String endpoint,
            @NotBlank String p256dh,
            @NotBlank String auth) {}

    public record EndpointRequest(@NotBlank String endpoint) {}

    private final PushSubscriptionRepository subs;
    private final String vapidPublicKey;

    public PushController(PushSubscriptionRepository subs,
                          @Value("${swadesi.push.vapid.public-key:}") String vapidPublicKey) {
        this.subs = subs;
        this.vapidPublicKey = vapidPublicKey;
    }

    /** Public: the VAPID application server key the browser needs to subscribe. */
    @GetMapping("/api/public/vapid-key")
    public Map<String, String> vapidKey() {
        return Map.of("publicKey", vapidPublicKey == null ? "" : vapidPublicKey);
    }

    /** Save (or refresh) this browser's push subscription for the logged-in user. */
    @PostMapping("/api/v1/me/push/subscribe")
    public Map<String, Boolean> subscribe(@AuthenticationPrincipal AuthenticatedUser auth,
                                          @Valid @RequestBody SubscribeRequest req) {
        PushSubscription s = subs.findByEndpoint(req.endpoint()).orElseGet(() -> {
            PushSubscription n = new PushSubscription();
            n.setId(UUID.randomUUID());
            n.setEndpoint(req.endpoint());
            n.setCreatedAt(OffsetDateTime.now());
            return n;
        });
        s.setUserId(auth.id());
        s.setP256dh(req.p256dh());
        s.setAuth(req.auth());
        subs.save(s);
        return Map.of("ok", true);
    }

    /** Remove this browser's subscription (user turned notifications off). */
    @PostMapping("/api/v1/me/push/unsubscribe")
    public Map<String, Boolean> unsubscribe(@AuthenticationPrincipal AuthenticatedUser auth,
                                            @Valid @RequestBody EndpointRequest req) {
        subs.deleteByEndpoint(req.endpoint());
        return Map.of("ok", true);
    }
}
