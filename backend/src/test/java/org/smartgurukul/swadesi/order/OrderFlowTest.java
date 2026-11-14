package org.smartgurukul.swadesi.order;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.smartgurukul.swadesi.whatsapp.WhatsAppSender;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class OrderFlowTest {

    static class RecordingSender extends WhatsAppSender {
        RecordingSender() { super("", "", "Swadesi"); }
        volatile String lastText;
        @Override public String send(String toPhone, String text) { this.lastText = text; return "t"; }
    }

    @TestConfiguration
    static class StubConfig {
        @Bean @Primary RecordingSender recordingSender() { return new RecordingSender(); }
    }

    @Autowired TestRestTemplate rest;
    @Autowired RecordingSender sender;

    private String login(String phone, double lat, double lng, String name) {
        rest.postForEntity("/api/v1/auth/otp/request", Map.of("phone", phone), Map.class);
        Matcher m = Pattern.compile("\\b(\\d{6})\\b").matcher(sender.lastText);
        assertThat(m.find()).isTrue();
        String token = (String) rest.postForEntity("/api/v1/auth/otp/verify",
                Map.of("phone", phone, "code", m.group(1)), Map.class).getBody().get("token");
        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(token);
        rest.exchange("/api/v1/me/onboarding", HttpMethod.POST,
                new HttpEntity<>(Map.of("name", name, "addressText", "x", "lat", lat, "lng", lng), h), Map.class);
        return token;
    }

    private HttpHeaders auth(String t) {
        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(t);
        return h;
    }

    @Test
    void orderClaimsServingsCapAndCookAcceptsRejects() {
        String cook = login("+919888800001", 12.9719, 77.6412, "Meera");
        String buyer = login("+919888800002", 12.9735, 77.6420, "Rohit");

        String listingId = (String) rest.exchange("/api/v1/listings", HttpMethod.POST,
                new HttpEntity<>(Map.of("title", "Veg Thali", "pricePerServing", 120, "maxServings", 3), auth(cook)),
                Map.class).getBody().get("id");

        // Order 2 of 3 -> ok, remaining 1 in feed.
        var o1 = rest.exchange("/api/v1/orders", HttpMethod.POST,
                new HttpEntity<>(Map.of("listingId", listingId, "qty", 2), auth(buyer)), Map.class);
        assertThat(o1.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(o1.getBody().get("status")).isEqualTo("requested");

        var feed = rest.exchange("/api/v1/listings/nearby", HttpMethod.GET, new HttpEntity<>(auth(buyer)), List.class);
        assertThat((int) ((Map) feed.getBody().get(0)).get("remaining")).isEqualTo(1);

        // Over-cap order (2 more > 1 left) -> 409.
        var over = rest.exchange("/api/v1/orders", HttpMethod.POST,
                new HttpEntity<>(Map.of("listingId", listingId, "qty", 2), auth(buyer)), Map.class);
        assertThat(over.getStatusCode().value()).isEqualTo(409);

        // You can't order your own dish.
        var own = rest.exchange("/api/v1/orders", HttpMethod.POST,
                new HttpEntity<>(Map.of("listingId", listingId, "qty", 1), auth(cook)), Map.class);
        assertThat(own.getStatusCode().value()).isEqualTo(400);

        // Cook sees the order and rejects it -> servings released (back to 3 left).
        var received = rest.exchange("/api/v1/orders/received", HttpMethod.GET, new HttpEntity<>(auth(cook)), List.class);
        assertThat(received.getBody()).hasSize(1);
        String orderId = (String) ((Map) received.getBody().get(0)).get("id");

        var rejected = rest.exchange("/api/v1/orders/" + orderId + "/status", HttpMethod.POST,
                new HttpEntity<>(Map.of("status", "rejected"), auth(cook)), Map.class);
        assertThat(rejected.getBody().get("status")).isEqualTo("rejected");

        var feed2 = rest.exchange("/api/v1/listings/nearby", HttpMethod.GET, new HttpEntity<>(auth(buyer)), List.class);
        assertThat((int) ((Map) feed2.getBody().get(0)).get("remaining")).isEqualTo(3);

        // Consumer's own orders list reflects the rejection.
        var mine = rest.exchange("/api/v1/orders/mine", HttpMethod.GET, new HttpEntity<>(auth(buyer)), List.class);
        assertThat(mine.getBody()).hasSize(1);
        assertThat(((Map) mine.getBody().get(0)).get("status")).isEqualTo("rejected");
    }

    @Test
    void acceptThenComplete() {
        String cook = login("+919888800011", 12.9719, 77.6412, "Meera");
        String buyer = login("+919888800012", 12.9735, 77.6420, "Rohit");
        String listingId = (String) rest.exchange("/api/v1/listings", HttpMethod.POST,
                new HttpEntity<>(Map.of("title", "Idli", "pricePerServing", 50, "maxServings", 5), auth(cook)),
                Map.class).getBody().get("id");
        rest.exchange("/api/v1/orders", HttpMethod.POST,
                new HttpEntity<>(Map.of("listingId", listingId, "qty", 1), auth(buyer)), Map.class);
        String orderId = (String) ((Map) rest.exchange("/api/v1/orders/received", HttpMethod.GET,
                new HttpEntity<>(auth(cook)), List.class).getBody().get(0)).get("id");

        // Can't complete before accepting.
        var early = rest.exchange("/api/v1/orders/" + orderId + "/status", HttpMethod.POST,
                new HttpEntity<>(Map.of("status", "completed"), auth(cook)), Map.class);
        assertThat(early.getStatusCode().value()).isEqualTo(409);

        rest.exchange("/api/v1/orders/" + orderId + "/status", HttpMethod.POST,
                new HttpEntity<>(Map.of("status", "accepted"), auth(cook)), Map.class);
        rest.exchange("/api/v1/orders/" + orderId + "/status", HttpMethod.POST,
                new HttpEntity<>(Map.of("status", "preparing"), auth(cook)), Map.class);
        var ready = rest.exchange("/api/v1/orders/" + orderId + "/status", HttpMethod.POST,
                new HttpEntity<>(Map.of("status", "ready"), auth(cook)), Map.class);
        assertThat(ready.getBody().get("status")).isEqualTo("ready");

        // Consumer sees the pickup code; cook does not.
        var mine = rest.exchange("/api/v1/orders/mine", HttpMethod.GET, new HttpEntity<>(auth(buyer)), List.class);
        String code = (String) ((Map) mine.getBody().get(0)).get("pickupCode");
        assertThat(code).isNotNull();
        var recv = rest.exchange("/api/v1/orders/received", HttpMethod.GET, new HttpEntity<>(auth(cook)), List.class);
        assertThat(((Map) recv.getBody().get(0)).get("pickupCode")).isNull();

        // Wrong code -> 400; correct code -> completed.
        var wrong = rest.exchange("/api/v1/orders/" + orderId + "/status", HttpMethod.POST,
                new HttpEntity<>(Map.of("status", "completed", "pickupCode", "0000"), auth(cook)), Map.class);
        assertThat(wrong.getStatusCode().value()).isEqualTo(400);
        var done = rest.exchange("/api/v1/orders/" + orderId + "/status", HttpMethod.POST,
                new HttpEntity<>(Map.of("status", "completed", "pickupCode", code), auth(cook)), Map.class);
        assertThat(done.getBody().get("status")).isEqualTo("completed");
    }
}
