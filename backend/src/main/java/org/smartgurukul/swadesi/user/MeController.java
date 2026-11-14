package org.smartgurukul.swadesi.user;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import org.smartgurukul.swadesi.security.AuthenticatedUser;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** The logged-in user's own profile: read it, and complete onboarding (name + location). */
@RestController
@RequestMapping("/api/v1/me")
public class MeController {

    public record MeResponse(String id, String phone, String name, String addressText,
                             Double lat, Double lng, boolean onboarded, String activeRole) {}

    public record OnboardingRequest(
            @NotBlank @Size(max = 80) String name,
            @NotBlank @Size(max = 300) String addressText,
            @NotNull @Min(-90) @Max(90) Double lat,
            @NotNull @Min(-180) @Max(180) Double lng) {}

    public record RoleRequest(@NotBlank String role) {}

    private final UserRepository users;

    public MeController(UserRepository users) {
        this.users = users;
    }

    @GetMapping
    public MeResponse me(@AuthenticationPrincipal AuthenticatedUser auth) {
        User u = users.findById(auth.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        return toResponse(u);
    }

    /** Complete (or update) onboarding: name + the location used for all vicinity searches. */
    @PostMapping("/onboarding")
    public MeResponse onboard(@AuthenticationPrincipal AuthenticatedUser auth,
                              @Valid @RequestBody OnboardingRequest req) {
        User u = users.findById(auth.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        u.setName(req.name().trim());
        u.setAddressText(req.addressText().trim());
        u.setLat(req.lat());
        u.setLng(req.lng());
        u.setOnboarded(true);
        u.setUpdatedAt(OffsetDateTime.now());
        return toResponse(users.save(u));
    }

    /** Switch the mode the user is acting in: "cook" or "consumer". */
    @PostMapping("/role")
    public MeResponse setRole(@AuthenticationPrincipal AuthenticatedUser auth,
                              @Valid @RequestBody RoleRequest req) {
        String role = req.role() == null ? "" : req.role().trim().toLowerCase();
        if (!role.equals("cook") && !role.equals("consumer")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Role must be 'cook' or 'consumer'");
        }
        User u = users.findById(auth.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        u.setActiveRole(role);
        u.setUpdatedAt(OffsetDateTime.now());
        return toResponse(users.save(u));
    }

    private static MeResponse toResponse(User u) {
        return new MeResponse(u.getId().toString(), u.getPhone(), u.getName(),
                u.getAddressText(), u.getLat(), u.getLng(), u.isOnboarded(), u.getActiveRole());
    }
}
