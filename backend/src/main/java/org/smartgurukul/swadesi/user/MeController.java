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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import java.io.IOException;

/** The logged-in user's own profile: read it, and complete onboarding (name + location). */
@RestController
@RequestMapping("/api/v1/me")
public class MeController {

    public record MeResponse(String id, String phone, String name, String addressText,
                             Double lat, Double lng, boolean onboarded, String activeRole,
                             String upiId, boolean admin, int searchRadiusM,
                             Double kitchenLat, Double kitchenLng, String kitchenAddress,
                             boolean hasAvatar) {}

    public record RadiusRequest(@Min(100) @Max(20000) int radiusMeters) {}

    public record KitchenRequest(
            @NotNull @Min(-90) @Max(90) Double lat,
            @NotNull @Min(-180) @Max(180) Double lng,
            @NotBlank @Size(max = 300) String addressText) {}

    public record OnboardingRequest(
            @NotBlank @Size(max = 80) String name,
            @Size(max = 300) String addressText,
            @NotNull @Min(-90) @Max(90) Double lat,
            @NotNull @Min(-180) @Max(180) Double lng) {}

    public record RoleRequest(@NotBlank String role) {}

    public record PayoutRequest(@NotBlank @Size(max = 120) String upiId) {}

    private final UserRepository users;
    private final UserPhotoRepository photos;

    public MeController(UserRepository users, UserPhotoRepository photos) {
        this.users = users;
        this.photos = photos;
    }

    /** Upload (or replace) the user's profile photo. */
    @PostMapping("/avatar")
    public MeResponse uploadAvatar(@AuthenticationPrincipal AuthenticatedUser auth,
                                   @RequestParam("file") MultipartFile file) {
        User u = users.findById(auth.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        String ct = file.getContentType();
        if (ct == null || !ct.startsWith("image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please upload an image");
        }
        if (file.getSize() > 5_000_000) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Image too large (max 5 MB)");
        }
        try {
            UserPhoto p = photos.findById(u.getId()).orElseGet(UserPhoto::new);
            p.setUserId(u.getId());
            p.setData(file.getBytes());
            p.setContentType(ct);
            p.setCreatedAt(OffsetDateTime.now());
            photos.save(p);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read the image");
        }
        u.setHasAvatar(true);
        u.setUpdatedAt(OffsetDateTime.now());
        return toResponse(users.save(u));
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
        u.setAddressText(req.addressText() == null || req.addressText().isBlank()
                ? null : req.addressText().trim());
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

    /** Set the cook's payout UPI ID (where order money is sent on pickup). */
    @PostMapping("/payout")
    public MeResponse setPayout(@AuthenticationPrincipal AuthenticatedUser auth,
                                @Valid @RequestBody PayoutRequest req) {
        String upi = req.upiId().trim();
        // Lenient UPI VPA check: handle@provider
        if (!upi.matches("^[a-zA-Z0-9.\\-_]{2,}@[a-zA-Z]{2,}$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Enter a valid UPI ID, e.g. name@okhdfcbank");
        }
        User u = users.findById(auth.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        u.setUpiId(upi);
        u.setUpdatedAt(OffsetDateTime.now());
        return toResponse(users.save(u));
    }

    /** Set the cook's kitchen (pickup) location — where their dishes are collected. */
    @PostMapping("/kitchen")
    public MeResponse setKitchen(@AuthenticationPrincipal AuthenticatedUser auth,
                                 @Valid @RequestBody KitchenRequest req) {
        User u = users.findById(auth.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        u.setKitchenLat(req.lat());
        u.setKitchenLng(req.lng());
        u.setKitchenAddress(req.addressText().trim());
        u.setUpdatedAt(OffsetDateTime.now());
        return toResponse(users.save(u));
    }

    /** Set the consumer's vicinity search radius (metres). */
    @PostMapping("/radius")
    public MeResponse setRadius(@AuthenticationPrincipal AuthenticatedUser auth,
                                @Valid @RequestBody RadiusRequest req) {
        User u = users.findById(auth.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        u.setSearchRadiusM(req.radiusMeters());
        u.setUpdatedAt(OffsetDateTime.now());
        return toResponse(users.save(u));
    }

    private static MeResponse toResponse(User u) {
        return new MeResponse(u.getId().toString(), u.getPhone(), u.getName(),
                u.getAddressText(), u.getLat(), u.getLng(), u.isOnboarded(), u.getActiveRole(),
                u.getUpiId(), u.isAdmin(), u.getSearchRadiusM(),
                u.getKitchenLat(), u.getKitchenLng(), u.getKitchenAddress(), u.isHasAvatar());
    }
}
