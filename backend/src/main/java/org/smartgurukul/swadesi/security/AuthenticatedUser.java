package org.smartgurukul.swadesi.security;

import java.util.UUID;

/** The principal set by {@link JwtAuthenticationFilter}: the logged-in user's id. */
public record AuthenticatedUser(UUID id, boolean admin) {}
