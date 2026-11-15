package org.smartgurukul.swadesi.push;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import java.security.Security;
import java.util.List;
import java.util.Map;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.Subscription;
import org.apache.http.HttpResponse;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * Sends Web Push (VAPID) notifications. Fail-soft: if VAPID keys are not configured it logs and
 * does nothing, so the app runs fine without push in dev. Expired subscriptions are pruned.
 */
@Service
public class PushService {

    private static final Logger log = LoggerFactory.getLogger(PushService.class);

    private final PushSubscriptionRepository subs;
    private final ObjectMapper json = new ObjectMapper();
    private final String publicKey;
    private final String privateKey;
    private final String subject;
    private nl.martijndwars.webpush.PushService delegate;

    public PushService(PushSubscriptionRepository subs,
                       @Value("${swadesi.push.vapid.public-key:}") String publicKey,
                       @Value("${swadesi.push.vapid.private-key:}") String privateKey,
                       @Value("${swadesi.push.vapid.subject:mailto:hello@swaadesi.org}") String subject) {
        this.subs = subs;
        this.publicKey = publicKey;
        this.privateKey = privateKey;
        this.subject = subject;
    }

    @PostConstruct
    void init() {
        if (publicKey == null || publicKey.isBlank() || privateKey == null || privateKey.isBlank()) {
            log.warn("Web Push disabled: VAPID keys not configured.");
            return;
        }
        try {
            if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
                Security.addProvider(new BouncyCastleProvider());
            }
            delegate = new nl.martijndwars.webpush.PushService(publicKey, privateKey, subject);
            log.info("Web Push enabled.");
        } catch (Exception e) {
            log.error("Could not initialize Web Push; push disabled.", e);
            delegate = null;
        }
    }

    public boolean isEnabled() {
        return delegate != null;
    }

    /** Send the same notification to every subscription of the given users (off the request thread). */
    @Async
    public void notifyUsers(List<java.util.UUID> userIds, String title, String body, String url) {
        if (delegate == null || userIds.isEmpty()) return;
        String payload;
        try {
            payload = json.writeValueAsString(Map.of(
                    "title", title, "body", body, "url", url == null ? "/" : url));
        } catch (Exception e) {
            log.error("Could not build push payload", e);
            return;
        }
        for (PushSubscription s : subs.findByUserIdIn(userIds)) {
            sendOne(s, payload);
        }
    }

    private void sendOne(PushSubscription s, String payload) {
        try {
            Subscription sub = new Subscription(
                    s.getEndpoint(), new Subscription.Keys(s.getP256dh(), s.getAuth()));
            HttpResponse resp = delegate.send(new Notification(sub, payload));
            int code = resp.getStatusLine().getStatusCode();
            // 404/410 => the browser dropped this subscription; stop trying it.
            if (code == 404 || code == 410) {
                subs.deleteByEndpoint(s.getEndpoint());
            } else if (code >= 400) {
                log.warn("Push to {} returned {}", s.getEndpoint(), code);
            }
        } catch (Exception e) {
            log.warn("Push send failed for {}: {}", s.getEndpoint(), e.toString());
        }
    }
}
