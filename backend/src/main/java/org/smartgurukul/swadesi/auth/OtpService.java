package org.smartgurukul.swadesi.auth;

import static org.springframework.http.HttpStatus.BAD_GATEWAY;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.TOO_MANY_REQUESTS;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.smartgurukul.swadesi.auth.AuthDtos.OtpLoginResponse;
import org.smartgurukul.swadesi.common.PhoneNormalizer;
import org.smartgurukul.swadesi.security.JwtService;
import org.smartgurukul.swadesi.user.User;
import org.smartgurukul.swadesi.user.UserRepository;
import org.smartgurukul.swadesi.whatsapp.WhatsAppSender;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Phone-OTP login, owned by this backend (mirrors Chhaon / Smart Gurukul). We generate a
 * one-time code, store only its BCrypt hash, deliver it over WhatsApp, verify it, and mint a
 * session JWT. A brand-new phone creates a user on first successful verify.
 *
 * <p>Never logs the phone number or the code (DPDP): only {@link WhatsAppSender#mask}.
 */
@Service
public class OtpService {

    private static final Logger log = LoggerFactory.getLogger(OtpService.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final OtpCodeRepository codes;
    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final WhatsAppSender whatsApp;
    private final JwtService jwt;

    private final int codeLength;
    private final long expiryMinutes;
    private final long cooldownSeconds;
    private final int maxPerHour;
    private final int maxFailedAttempts;
    private final Set<String> testPhones;
    private final String testCode;

    public OtpService(OtpCodeRepository codes,
                      UserRepository users,
                      PasswordEncoder passwordEncoder,
                      WhatsAppSender whatsApp,
                      JwtService jwt,
                      @Value("${app.otp.code-length:6}") int codeLength,
                      @Value("${app.otp.expiry-minutes:5}") long expiryMinutes,
                      @Value("${app.otp.request-cooldown-seconds:30}") long cooldownSeconds,
                      @Value("${app.otp.max-requests-per-hour:5}") int maxPerHour,
                      @Value("${app.otp.max-failed-attempts:5}") int maxFailedAttempts,
                      @Value("${app.otp.test-phones:}") String testPhonesCsv,
                      @Value("${app.otp.test-code:}") String testCode) {
        this.codes = codes;
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.whatsApp = whatsApp;
        this.jwt = jwt;
        this.codeLength = codeLength;
        this.expiryMinutes = expiryMinutes;
        this.cooldownSeconds = cooldownSeconds;
        this.maxPerHour = maxPerHour;
        this.maxFailedAttempts = maxFailedAttempts;
        // Test accounts (dummy cook/consumer for QA): these phones skip WhatsApp and log in with
        // a fixed code. Fails closed — off unless both are set and the code is >= 6 chars.
        Set<String> parsed = new java.util.HashSet<>();
        if (testPhonesCsv != null) {
            for (String p : testPhonesCsv.split(",")) {
                String n = PhoneNormalizer.normalize(p.trim());
                if (n != null) parsed.add(n);
            }
        }
        boolean on = !parsed.isEmpty() && testCode != null && testCode.trim().length() >= 6;
        this.testPhones = on ? parsed : Set.of();
        this.testCode = on ? testCode.trim() : null;
    }

    private boolean isTestPhone(String normalizedPhone) {
        return testPhones.contains(normalizedPhone);
    }

    /** Generate, store (hashed) and send a code. Rate-limited per phone. */
    @Transactional
    public void requestCode(String rawPhone) {
        String phone = normalizeOr400(rawPhone);
        if (isTestPhone(phone)) return; // fixed code, nothing to send or store
        OffsetDateTime now = OffsetDateTime.now();

        codes.findFirstByPhoneOrderByCreatedAtDesc(phone).ifPresent(last -> {
            if (last.getCreatedAt().plusSeconds(cooldownSeconds).isAfter(now)) {
                throw new ResponseStatusException(TOO_MANY_REQUESTS, "Please wait a little before asking for another code");
            }
        });
        if (codes.countByPhoneAndCreatedAtAfter(phone, now.minusHours(1)) >= maxPerHour) {
            throw new ResponseStatusException(TOO_MANY_REQUESTS, "Too many codes requested. Please try again later");
        }

        String code = generateCode();
        OtpCode row = new OtpCode();
        row.setId(UUID.randomUUID());
        row.setPhone(phone);
        row.setCodeHash(passwordEncoder.encode(code));
        row.setExpiresAt(now.plusMinutes(expiryMinutes));
        row.setCreatedAt(now);
        codes.save(row);

        try {
            whatsApp.send(phone, "Your Swaadesi login code is " + code
                    + ". It is valid for " + expiryMinutes + " minutes. Never share it with anyone.");
        } catch (Exception e) {
            log.error("otp request: delivery failed to {} ({})",
                    WhatsAppSender.mask(phone), WhatsAppSender.failureReason(e), e);
            throw new ResponseStatusException(BAD_GATEWAY, "Could not send the code right now. Please try again");
        }
    }

    /**
     * Verify a code; on success resolve or create the user and mint a session token. A wrong
     * guess saves the higher failed count (and burns the code at the limit) and THEN answers
     * 401, so the 401 must not roll that save back.
     */
    @Transactional(noRollbackFor = ResponseStatusException.class)
    public OtpLoginResponse verify(String rawPhone, String rawCode) {
        String phone = normalizeOr400(rawPhone);
        String code = rawCode == null ? "" : rawCode.trim();
        OffsetDateTime now = OffsetDateTime.now();

        // Test accounts: constant-time compare against the fixed code, no stored OTP row.
        if (isTestPhone(phone)) {
            if (!java.security.MessageDigest.isEqual(
                    code.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                    testCode.getBytes(java.nio.charset.StandardCharsets.UTF_8))) {
                throw new ResponseStatusException(UNAUTHORIZED, "This code is wrong or has expired");
            }
            Optional<User> ex = users.findByPhone(phone);
            User u = ex.orElseGet(() -> createUser(phone, now));
            return new OtpLoginResponse(jwt.issueToken(u.getId(), u.isAdmin()),
                    u.getId().toString(), u.getName(), u.isOnboarded(), ex.isEmpty());
        }

        OtpCode row = codes
                .findFirstByPhoneAndConsumedAtIsNullAndExpiresAtAfterOrderByCreatedAtDesc(phone, now)
                .orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED, "This code is wrong or has expired"));

        if (row.getFailedAttempts() >= maxFailedAttempts) {
            row.setConsumedAt(now); // burn it
            codes.save(row);
            throw new ResponseStatusException(UNAUTHORIZED, "This code is wrong or has expired");
        }

        if (!passwordEncoder.matches(code, row.getCodeHash())) {
            row.setFailedAttempts(row.getFailedAttempts() + 1);
            if (row.getFailedAttempts() >= maxFailedAttempts) {
                row.setConsumedAt(now); // burn after too many wrong guesses
            }
            codes.save(row);
            throw new ResponseStatusException(UNAUTHORIZED, "This code is wrong or has expired");
        }

        row.setConsumedAt(now);
        codes.save(row);

        Optional<User> existing = users.findByPhone(phone);
        User user = existing.orElseGet(() -> createUser(phone, now));
        String token = jwt.issueToken(user.getId(), user.isAdmin());
        return new OtpLoginResponse(
                token, user.getId().toString(), user.getName(), user.isOnboarded(), existing.isEmpty());
    }

    private User createUser(String phone, OffsetDateTime now) {
        User u = new User();
        u.setId(UUID.randomUUID());
        u.setPhone(phone);
        u.setCreatedAt(now);
        u.setUpdatedAt(now);
        return users.save(u);
    }

    private String normalizeOr400(String raw) {
        String phone = PhoneNormalizer.normalize(raw);
        if (phone == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Please enter a valid phone number");
        }
        return phone;
    }

    private String generateCode() {
        StringBuilder sb = new StringBuilder(codeLength);
        for (int i = 0; i < codeLength; i++) sb.append(RANDOM.nextInt(10));
        return sb.toString();
    }
}
