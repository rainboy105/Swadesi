package org.smartgurukul.swadesi.auth;

import static org.assertj.core.api.Assertions.assertThat;

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
import org.springframework.http.ResponseEntity;
import org.smartgurukul.swadesi.whatsapp.WhatsAppSender;

/** The whole login flow: request a code -> verify -> onboard -> /me. WhatsApp is stubbed. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthFlowTest {

    /** Records the last message instead of talking to a gateway. */
    static class RecordingSender extends WhatsAppSender {
        volatile String lastText;

        RecordingSender() {
            super("", "", "Swadesi");
        }

        @Override
        public String send(String toPhone, String text) {
            this.lastText = text;
            return "test-" + System.nanoTime();
        }
    }

    @TestConfiguration
    static class StubConfig {
        @Bean
        @Primary
        RecordingSender recordingSender() {
            return new RecordingSender();
        }
    }

    @Autowired TestRestTemplate rest;
    @Autowired RecordingSender sender;

    private String extractCode() {
        Matcher m = Pattern.compile("\\b(\\d{6})\\b").matcher(sender.lastText);
        assertThat(m.find()).as("OTP in message: " + sender.lastText).isTrue();
        return m.group(1);
    }

    @Test
    void fullLoginAndOnboardingFlow() {
        String phone = "+919876543210";

        // 1. Request a code.
        ResponseEntity<Map> sent = rest.postForEntity("/api/v1/auth/otp/request",
                Map.of("phone", phone), Map.class);
        assertThat(sent.getStatusCode().is2xxSuccessful()).isTrue();
        String code = extractCode();

        // 2. Wrong code -> 401 and no token.
        ResponseEntity<Map> bad = rest.postForEntity("/api/v1/auth/otp/verify",
                Map.of("phone", phone, "code", "000000"), Map.class);
        assertThat(bad.getStatusCode().value()).isEqualTo(401);

        // 3. Right code -> token, new user, not onboarded.
        ResponseEntity<Map> ok = rest.postForEntity("/api/v1/auth/otp/verify",
                Map.of("phone", phone, "code", code), Map.class);
        assertThat(ok.getStatusCode().is2xxSuccessful()).isTrue();
        Map body = ok.getBody();
        assertThat(body.get("token")).isNotNull();
        assertThat(body.get("newUser")).isEqualTo(true);
        assertThat(body.get("onboarded")).isEqualTo(false);
        String token = (String) body.get("token");

        // 4. The consumed code cannot be reused.
        ResponseEntity<Map> reused = rest.postForEntity("/api/v1/auth/otp/verify",
                Map.of("phone", phone, "code", code), Map.class);
        assertThat(reused.getStatusCode().value()).isEqualTo(401);

        // 5. /me requires auth.
        assertThat(rest.getForEntity("/api/v1/me", String.class).getStatusCode().value())
                .isIn(401, 403);

        // 6. Onboarding sets name + location.
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        ResponseEntity<Map> onboarded = rest.exchange("/api/v1/me/onboarding", HttpMethod.POST,
                new HttpEntity<>(Map.of(
                        "name", "Asha",
                        "addressText", "A-402, Green Meadows, Baner, Pune",
                        "lat", 18.5590, "lng", 73.7868), headers),
                Map.class);
        assertThat(onboarded.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(onboarded.getBody().get("onboarded")).isEqualTo(true);
        assertThat(onboarded.getBody().get("name")).isEqualTo("Asha");

        // 7. /me reflects it.
        ResponseEntity<Map> me = rest.exchange("/api/v1/me", HttpMethod.GET,
                new HttpEntity<>(headers), Map.class);
        assertThat(me.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(me.getBody().get("phone")).isEqualTo(phone);
        assertThat(me.getBody().get("lat")).isEqualTo(18.5590);

        // 8. Logging in again is NOT a new user.
        rest.postForEntity("/api/v1/auth/otp/request", Map.of("phone", phone), Map.class);
        String code2 = extractCode();
        ResponseEntity<Map> again = rest.postForEntity("/api/v1/auth/otp/verify",
                Map.of("phone", phone, "code", code2), Map.class);
        assertThat(again.getBody().get("newUser")).isEqualTo(false);
        assertThat(again.getBody().get("onboarded")).isEqualTo(true);
    }

    @Test
    void invalidPhoneIs400() {
        ResponseEntity<Map> resp = rest.postForEntity("/api/v1/auth/otp/request",
                Map.of("phone", "12345"), Map.class);
        assertThat(resp.getStatusCode().value()).isEqualTo(400);
    }
}
