package org.smartgurukul.swadesi.web;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.YearMonth;
import java.util.LinkedHashSet;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
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

    private static final Logger log = LoggerFactory.getLogger(GeocodeController.class);

    // Nominatim requires a descriptive User-Agent; it must not contain personal data.
    private final RestClient client = RestClient.builder()
            .baseUrl("https://nominatim.openstreetmap.org")
            .defaultHeader("User-Agent", "Swadesi/1.0 (hyperlocal food app)")
            .build();

    // Ola Maps: much better Indian society/POI coverage. Used first, capped to the free tier.
    private final RestClient ola = RestClient.builder()
            .baseUrl("https://api.olamaps.io")
            .build();

    private final JdbcTemplate jdbc;
    private final String olaKey;
    private final long olaMonthlyLimit;

    public GeocodeController(JdbcTemplate jdbc,
                             @Value("${swadesi.geocode.ola.api-key:}") String olaKey,
                             @Value("${swadesi.geocode.ola.monthly-limit:90000}") long olaMonthlyLimit) {
        this.jdbc = jdbc;
        this.olaKey = olaKey;
        this.olaMonthlyLimit = olaMonthlyLimit;
    }

    /**
     * Atomically count this month's Ola calls and report whether this one is within the cap.
     * Fails safe: any error returns false so we fall back to the free OSM geocoder.
     */
    private boolean reserveOlaCall() {
        if (olaKey == null || olaKey.isBlank()) return false;
        try {
            String ym = YearMonth.now().toString(); // e.g. 2026-11
            Long count = jdbc.queryForObject(
                    "insert into geocode_usage(ym, ola_count) values (?, 1) "
                            + "on conflict (ym) do update set ola_count = geocode_usage.ola_count + 1 "
                            + "returning ola_count",
                    Long.class, ym);
            return count != null && count <= olaMonthlyLimit;
        } catch (Exception e) {
            log.warn("geocode usage counter failed; falling back to OSM: {}", e.toString());
            return false;
        }
    }

    /**
     * Forward search: turn a typed query ("Green Meadows, Baner") into a few candidate places with
     * coordinates, so the user can pick their society instead of panning the map. India-biased.
     */
    @GetMapping("/geocode-search")
    public java.util.List<java.util.Map<String, Object>> search(
            @RequestParam("q") String q,
            @RequestParam(value = "lat", required = false) Double lat,
            @RequestParam(value = "lng", required = false) Double lng) {
        if (q == null || q.trim().length() < 3) return new java.util.ArrayList<>();
        // Ola first (within the monthly cap) — best Indian society/POI coverage.
        if (reserveOlaCall()) {
            java.util.List<java.util.Map<String, Object>> olaHits = olaSearch(q.trim(), lat, lng);
            if (!olaHits.isEmpty()) return olaHits;
        }
        // Fallback: OpenStreetMap Nominatim.
        return nominatimSearch(q.trim());
    }

    /** Ola Maps place autocomplete; biased to the viewer's location when provided. */
    private java.util.List<java.util.Map<String, Object>> olaSearch(String q, Double lat, Double lng) {
        java.util.List<java.util.Map<String, Object>> out = new java.util.ArrayList<>();
        try {
            JsonNode r = ola.get()
                    .uri(u -> {
                        u.path("/places/v1/autocomplete").queryParam("input", q).queryParam("api_key", olaKey);
                        if (lat != null && lng != null) u.queryParam("location", lat + "," + lng);
                        return u.build();
                    })
                    .retrieve()
                    .body(JsonNode.class);
            if (r == null) return out;
            for (JsonNode p : r.path("predictions")) {
                JsonNode loc = p.path("geometry").path("location");
                double plat = loc.path("lat").asDouble(Double.NaN);
                double plng = loc.path("lng").asDouble(Double.NaN);
                if (Double.isNaN(plat) || Double.isNaN(plng)) continue;
                JsonNode sf = p.path("structured_formatting");
                String main = sf.path("main_text").asText("");
                String secondary = sf.path("secondary_text").asText("");
                String label = main.isBlank()
                        ? p.path("description").asText("")
                        : (secondary.isBlank() ? main : main + ", " + secondary);
                if (label.isBlank()) continue;
                out.add(java.util.Map.of("label", label, "lat", plat, "lng", plng));
                if (out.size() >= 6) break;
            }
        } catch (Exception e) {
            log.warn("Ola geocode failed; falling back to OSM: {}", e.toString());
        }
        return out;
    }

    /** OpenStreetMap Nominatim forward search (free fallback). */
    private java.util.List<java.util.Map<String, Object>> nominatimSearch(String q) {
        java.util.List<java.util.Map<String, Object>> out = new java.util.ArrayList<>();
        try {
            JsonNode r = client.get()
                    .uri(u -> u.path("/search")
                            .queryParam("q", q)
                            .queryParam("format", "jsonv2")
                            .queryParam("addressdetails", 1)
                            .queryParam("limit", 6)
                            .queryParam("countrycodes", "in")
                            .build())
                    .retrieve()
                    .body(JsonNode.class);
            if (r == null || !r.isArray()) return out;
            for (JsonNode n : r) {
                String label = n.path("display_name").asText("");
                double lat = n.path("lat").asDouble(Double.NaN);
                double lon = n.path("lon").asDouble(Double.NaN);
                if (label.isBlank() || Double.isNaN(lat) || Double.isNaN(lon)) continue;
                out.add(java.util.Map.of("label", label, "lat", lat, "lng", lon));
            }
        } catch (Exception e) {
            return out;
        }
        return out;
    }

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
