package org.smartgurukul.swadesi.web;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.LinkedHashSet;
import java.util.Set;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

/**
 * Server-side reverse geocoding so the browser calls our own API (no third-party host that an
 * ad/tracker blocker might block, and no cross-origin redirect/CORS issues). Public.
 *
 * <p>Uses OpenStreetMap Nominatim at street level (road / neighbourhood / suburb), which is far
 * more precise than city-only sources. Note: this address string is for display; the vicinity
 * search uses the device's precise GPS lat/lng stored on the user, not this text.
 */
@RestController
@RequestMapping("/api/public")
public class GeocodeController {

    // Nominatim requires a descriptive User-Agent; it must not contain personal data.
    private final RestClient client = RestClient.builder()
            .baseUrl("https://nominatim.openstreetmap.org")
            .defaultHeader("User-Agent", "Swadesi/1.0 (hyperlocal food app)")
            .build();

    @GetMapping("/reverse-geocode")
    public java.util.Map<String, Object> reverse(@RequestParam double lat, @RequestParam double lng) {
        try {
            JsonNode r = client.get()
                    .uri(u -> u.path("/reverse")
                            .queryParam("lat", lat)
                            .queryParam("lon", lng)
                            .queryParam("format", "jsonv2")
                            .queryParam("zoom", 18)          // building/street level
                            .queryParam("addressdetails", 1)
                            .build())
                    .retrieve()
                    .body(JsonNode.class);
            if (r == null) return java.util.Map.of("address", "");
            JsonNode a = r.path("address");

            Set<String> parts = new LinkedHashSet<>();
            add(parts, a, "road");
            // The most specific neighbourhood-ish field available.
            addFirst(parts, a, "neighbourhood", "suburb", "quarter", "residential");
            addFirst(parts, a, "city", "town", "village", "municipality", "county");
            add(parts, a, "state");
            add(parts, a, "postcode");

            return java.util.Map.of("address", String.join(", ", parts));
        } catch (Exception e) {
            return java.util.Map.of("address", "");
        }
    }

    private static void add(Set<String> parts, JsonNode a, String key) {
        String v = a.path(key).asText("");
        if (!v.isBlank()) parts.add(v.trim());
    }

    private static void addFirst(Set<String> parts, JsonNode a, String... keys) {
        for (String key : keys) {
            String v = a.path(key).asText("");
            if (!v.isBlank()) {
                parts.add(v.trim());
                return;
            }
        }
    }
}
