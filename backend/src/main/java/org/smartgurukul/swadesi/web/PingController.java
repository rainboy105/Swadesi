package org.smartgurukul.swadesi.web;

import java.time.Instant;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public")
public class PingController {

    @GetMapping("/ping")
    public Map<String, Object> ping() {
        return Map.of("app", "swadesi", "time", Instant.now().toString());
    }
}
