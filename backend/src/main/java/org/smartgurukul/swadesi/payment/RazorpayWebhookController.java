package org.smartgurukul.swadesi.payment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.smartgurukul.swadesi.listing.Listing;
import org.smartgurukul.swadesi.listing.ListingRepository;
import org.smartgurukul.swadesi.order.FoodOrder;
import org.smartgurukul.swadesi.order.FoodOrderRepository;
import org.smartgurukul.swadesi.user.UserRepository;
import org.smartgurukul.swadesi.whatsapp.WhatsAppSender;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Razorpay webhook backstop: confirms a paid order server-to-server even if the browser never
 * returns to call /verify-payment. Public (SecurityConfig permits /api/public/**), but every
 * request must carry a valid HMAC signature. Fails closed when no webhook secret is set.
 */
@RestController
@RequestMapping("/api/public/razorpay")
public class RazorpayWebhookController {

    private static final Logger log = LoggerFactory.getLogger(RazorpayWebhookController.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final RazorpayService razorpay;
    private final FoodOrderRepository orders;
    private final ListingRepository listings;
    private final UserRepository users;
    private final WhatsAppSender whatsApp;

    public RazorpayWebhookController(RazorpayService razorpay, FoodOrderRepository orders,
                                     ListingRepository listings, UserRepository users,
                                     WhatsAppSender whatsApp) {
        this.razorpay = razorpay;
        this.orders = orders;
        this.listings = listings;
        this.users = users;
        this.whatsApp = whatsApp;
    }

    @PostMapping("/webhook")
    @Transactional
    public ResponseEntity<String> webhook(@RequestBody String rawBody,
                                          @RequestHeader(value = "X-Razorpay-Signature", required = false) String signature) {
        if (!razorpay.isWebhookConfigured()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body("webhook not configured");
        }
        if (!razorpay.verifyWebhook(rawBody, signature)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("bad signature");
        }
        try {
            JsonNode root = MAPPER.readTree(rawBody);
            String event = root.path("event").asText("");
            // Pull the Razorpay order id + payment id from either payment.* or order.* payloads.
            JsonNode pay = root.path("payload").path("payment").path("entity");
            String rzpOrderId = pay.path("order_id").asText("");
            String paymentId = pay.path("id").asText("");
            if (rzpOrderId.isBlank()) {
                rzpOrderId = root.path("payload").path("order").path("entity").path("id").asText("");
            }
            // Only a CAPTURED payment means money is actually taken. An 'authorized' payment is
            // merely on hold and may never be captured (or gets auto-refunded), so treating it as
            // paid falsely tells the cook an order was placed. Order 'order.paid' implies capture.
            boolean paidEvent = event.equals("payment.captured") || event.equals("order.paid");
            if (paidEvent && !rzpOrderId.isBlank()) {
                markPaid(rzpOrderId, paymentId);
            }
        } catch (Exception e) {
            log.warn("razorpay webhook: could not process ({})", e.getMessage());
            // Still 200 so Razorpay doesn't hammer retries for an unparseable-but-authentic event.
        }
        return ResponseEntity.ok("ok");
    }

    private void markPaid(String rzpOrderId, String paymentId) {
        FoodOrder o = orders.findByRazorpayOrderId(rzpOrderId).orElse(null);
        if (o == null || !"pending_payment".equals(o.getStatus())) return; // unknown or already handled
        OffsetDateTime now = OffsetDateTime.now();
        o.setPaid(true);
        if (paymentId != null && !paymentId.isBlank()) o.setRazorpayPaymentId(paymentId);
        o.setStatus("requested");
        o.setUpdatedAt(now);
        orders.save(o);

        Listing l = listings.findById(o.getListingId()).orElse(null);
        if (l != null) {
            users.findById(l.getCookId()).ifPresent(cook -> {
                if (cook.getPhone() == null) return;
                try {
                    whatsApp.send(cook.getPhone(), "New Swaadesi order: " + o.getQty() + " × " + l.getTitle()
                            + (o.getConsumerName() != null ? " from " + o.getConsumerName() : "")
                            + ". Open the app to accept.");
                } catch (Exception e) {
                    log.warn("webhook cook notify failed ({})", WhatsAppSender.failureReason(e));
                }
            });
        }
        log.info("razorpay webhook: order {} marked paid", o.getId());
    }
}
