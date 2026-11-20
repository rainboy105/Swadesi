package org.smartgurukul.swadesi.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Issues and validates HS256 JWTs (jjwt, env-provided secret).
 *
 * <p>Sessions never expire: a user stays logged in until they log out themselves. New tokens
 * carry no expiry, and tokens issued earlier with a 24-hour expiry are still accepted after it
 * passes. The only way to invalidate every session at once is to rotate APP_JWT_SECRET.
 */
@Service
public class JwtService {

    private final SecretKey key;
    private final String issuer;

    public JwtService(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.issuer:swadesi}") String issuer) {
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException("APP_JWT_SECRET must be set and at least 32 bytes long");
        }
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.issuer = issuer;
    }

    public String issueToken(UUID userId, boolean admin) {
        Instant now = Instant.now();
        return Jwts.builder()
                .issuer(issuer)
                .subject(userId.toString())
                .claim("admin", admin)
                .issuedAt(Date.from(now))
                .signWith(key)
                .compact();
    }

    public Claims parse(String token) {
        try {
            return Jwts.parser()
                    .verifyWith(key)
                    .requireIssuer(issuer)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
        } catch (ExpiredJwtException e) {
            // An older token whose 24-hour expiry has passed. Its signature was verified before
            // the expiry check, so it is genuine; honour it (still must be ours).
            Claims claims = e.getClaims();
            if (claims == null || !issuer.equals(claims.getIssuer())) throw e;
            return claims;
        }
    }
}
