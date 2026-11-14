package org.smartgurukul.swadesi.web;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

/**
 * Server-side reverse geocoding so the browser calls our own API (no third-party host that an
 * ad/tracker blocker might block, and no cross-origin redirect/CORS issues). Public.
 */
@RestController
@RequestMapping("/api/public")
public class GeocodeController {

    private final RestClient client = RestClient.builder()
            .baseUrl("https://api.bigdatacloud.net")
            .build();

    @GetMapping("/reverse-geocode")
    public Map<String, Object> reverse(@RequestParam double lat, @RequestParam double lng) {
        try {
            JsonNode d = client.get()
                    .uri(u -> u.path("/data/reverse-geocode-client")
                            .queryParam("latitude", lat)
                            .queryParam("longitude", lng)
                            .queryParam("localityLanguage", "en")
                            .build())
                    .retrieve()
                    .body(JsonNode.class);
            if (d == null) return Map.of("address", "");

            List<String> raw = new ArrayList<>();
            raw.add(d.path("locality").asText(""));
            String city = d.path("city").asText("");
            if (!city.equals(d.path("locality").asText(""))) raw.add(city);
            raw.add(d.path("principalSubdivision").asText(""));
            raw.add(d.path("postcode").asText(""));

            Set<String> parts = new LinkedHashSet<>();
            for (String p : raw) {
                if (p != null && !p.isBlank()) parts.add(p.trim());
            }
            return Map.of("address", String.join(", ", parts));
        } catch (Exception e) {
            return Map.of("address", "");
        }
    }
}
