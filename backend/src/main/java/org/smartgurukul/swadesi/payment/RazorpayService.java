package org.smartgurukul.swadesi.payment;

import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * Minimal Razorpay client over the REST API (no SDK): create an order, verify the checkout
 * signature, and refund. Disabled (and all calls no-op/throw) when keys aren't configured, so
 * the app runs without payments until RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are set.
 */
@Service
public class RazorpayService {

    private static final Logger log = LoggerFactory.getLogger(RazorpayService.class);

    private final String keyId;
    private final String keySecret;
    private final String webhookSecret;
    private final RestClient client;

    public RazorpayService(
            @Value("${app.razorpay.key-id:}") String keyId,
            @Value("${app.razorpay.key-secret:}") String keySecret,
            @Value("${app.razorpay.webhook-secret:}") String webhookSecret) {
        this.keyId = keyId;
        this.keySecret = keySecret;
        this.webhookSecret = webhookSecret;
        this.client = (keyId == null || keyId.isBlank() || keySecret == null || keySecret.isBlank())
                ? null
                : RestClient.builder()
                        .baseUrl("https://api.razorpay.com/v1")
                        .defaultHeaders(h -> h.setBasicAuth(keyId, keySecret))
                        .build();
    }

    public boolean isConfigured() {
        return client != null;
    }

    public boolean isWebhookConfigured() {
        return webhookSecret != null && !webhookSecret.isBlank();
    }

    /** Verify a webhook delivery: X-Razorpay-Signature = HMAC_SHA256(rawBody, webhookSecret). */
    public boolean verifyWebhook(String rawBody, String signature) {
        if (!isWebhookConfigured()) return false;
        String expected = hmacSha256(rawBody, webhookSecret);
        return expected != null && java.security.MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                (signature == null ? "" : signature).getBytes(StandardCharsets.UTF_8));
    }

    public String keyId() {
        return keyId;
    }

    /** Create a Razorpay order for the given amount (paise); returns its id. */
    public String createOrder(int amountPaise, String receipt) {
        JsonNode resp = client.post()
                .uri("/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("amount", amountPaise, "currency", "INR", "receipt", receipt,
                        "payment_capture", 1))
                .retrieve()
                .body(JsonNode.class);
        if (resp == null || resp.path("id").asText("").isBlank()) {
            throw new IllegalStateException("Razorpay order create failed");
        }
        return resp.path("id").asText();
    }

    /** Verify the checkout callback signature = HMAC_SHA256(order_id|payment_id, key_secret). */
    public boolean verifySignature(String razorpayOrderId, String razorpayPaymentId, String signature) {
        String expected = hmacSha256(razorpayOrderId + "|" + razorpayPaymentId, keySecret);
        return expected != null && java.security.MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                (signature == null ? "" : signature).getBytes(StandardCharsets.UTF_8));
    }

    /** Refund a captured payment (full amount). Best-effort. */
    public void refund(String razorpayPaymentId, int amountPaise) {
        if (client == null) return;
        try {
            client.post()
                    .uri("/payments/{id}/refund", razorpayPaymentId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("amount", amountPaise))
                    .retrieve()
                    .body(JsonNode.class);
        } catch (Exception e) {
            log.warn("razorpay refund failed for payment {}: {}", razorpayPaymentId, e.getMessage());
        }
    }

    private static String hmacSha256(String data, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] out = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(out.length * 2);
            for (byte b : out) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }
}
