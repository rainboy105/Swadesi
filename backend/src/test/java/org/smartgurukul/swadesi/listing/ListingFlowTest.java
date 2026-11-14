package org.smartgurukul.swadesi.listing;

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

/** Cook lists a dish; a nearby consumer sees it in the feed, a far one does not. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ListingFlowTest {

    static class RecordingSender extends WhatsAppSender {
        volatile String lastText;
        RecordingSender() { super("", "", "Swadesi"); }
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
        var verify = rest.postForEntity("/api/v1/auth/otp/verify",
                Map.of("phone", phone, "code", m.group(1)), Map.class);
        String token = (String) verify.getBody().get("token");
        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(token);
        rest.exchange("/api/v1/me/onboarding", HttpMethod.POST,
                new HttpEntity<>(Map.of("name", name, "addressText", "x", "lat", lat, "lng", lng), h), Map.class);
        return token;
    }

    private HttpHeaders auth(String token) {
        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(token);
        return h;
    }

    @Test
    void cookListsAndNearbyConsumerSeesIt() {
        // Cook in Indiranagar.
        String cook = login("+919812300001", 12.9719, 77.6412, "Meera");
        // Consumer ~200 m away.
        String near = login("+919812300002", 12.9735, 77.6420, "Rohit");
        // Consumer ~5 km away.
        String far = login("+919812300003", 12.9352, 77.6245, "Asha");

        // Cook creates a listing.
        var created = rest.exchange("/api/v1/listings", HttpMethod.POST,
                new HttpEntity<>(Map.of("title", "Veg Thali", "description", "Dal, rice, 2 sabzi",
                        "pricePerServing", 120, "maxServings", 10), auth(cook)), Map.class);
        assertThat(created.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(created.getBody().get("remaining")).isEqualTo(10);

        // Nearby consumer sees it with a distance.
        var nearFeed = rest.exchange("/api/v1/listings/nearby", HttpMethod.GET,
                new HttpEntity<>(auth(near)), List.class);
        assertThat(nearFeed.getBody()).hasSize(1);
        Map item = (Map) nearFeed.getBody().get(0);
        assertThat(item.get("title")).isEqualTo("Veg Thali");
        assertThat(item.get("cookName")).isEqualTo("Meera");
        assertThat((int) item.get("distanceMeters")).isLessThan(500);

        // Far consumer sees nothing.
        var farFeed = rest.exchange("/api/v1/listings/nearby", HttpMethod.GET,
                new HttpEntity<>(auth(far)), List.class);
        assertThat(farFeed.getBody()).isEmpty();

        // Cook sees it in "mine".
        var mine = rest.exchange("/api/v1/listings/mine", HttpMethod.GET,
                new HttpEntity<>(auth(cook)), List.class);
        assertThat(mine.getBody()).hasSize(1);

        // Cook closes it -> disappears from the nearby feed.
        String id = (String) ((Map) mine.getBody().get(0)).get("id");
        rest.exchange("/api/v1/listings/" + id + "/status", HttpMethod.POST,
                new HttpEntity<>(Map.of("status", "closed"), auth(cook)), Map.class);
        var afterClose = rest.exchange("/api/v1/listings/nearby", HttpMethod.GET,
                new HttpEntity<>(auth(near)), List.class);
        assertThat(afterClose.getBody()).isEmpty();
    }
}
