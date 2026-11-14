package org.smartgurukul.swadesi.auth;

import jakarta.validation.constraints.NotBlank;

public final class AuthDtos {

    private AuthDtos() {}

    public record OtpRequest(@NotBlank String phone) {}

    public record OtpVerifyRequest(@NotBlank String phone, @NotBlank String code) {}

    /** The login answer: our session token plus enough profile to route the UI. */
    public record OtpLoginResponse(
            String token,
            String userId,
            String name,
            boolean onboarded,
            boolean newUser) {}
}
