package org.smartgurukul.swadesi.auth;

import jakarta.validation.Valid;
import java.util.Map;
import org.smartgurukul.swadesi.auth.AuthDtos.OtpLoginResponse;
import org.smartgurukul.swadesi.auth.AuthDtos.OtpRequest;
import org.smartgurukul.swadesi.auth.AuthDtos.OtpVerifyRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Phone-OTP login endpoints. Public (SecurityConfig permits {@code /api/v1/auth/**}).
 * <ul>
 *   <li>{@code POST /api/v1/auth/otp/request} — send a code over WhatsApp.</li>
 *   <li>{@code POST /api/v1/auth/otp/verify} — check the code; return a session token (and
 *       create the user if this phone is new).</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/auth/otp")
public class OtpController {

    private final OtpService otp;

    public OtpController(OtpService otp) {
        this.otp = otp;
    }

    @PostMapping("/request")
    public ResponseEntity<Map<String, Object>> request(@Valid @RequestBody OtpRequest req) {
        otp.requestCode(req.phone());
        // Always a plain OK: never reveal whether the number already has an account.
        return ResponseEntity.ok(Map.of("sent", Boolean.TRUE));
    }

    @PostMapping("/verify")
    public OtpLoginResponse verify(@Valid @RequestBody OtpVerifyRequest req) {
        return otp.verify(req.phone(), req.code());
    }
}
