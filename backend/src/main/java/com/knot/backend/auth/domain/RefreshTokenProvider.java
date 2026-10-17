package com.knot.backend.auth.domain;

import com.knot.backend.auth.domain.model.RefreshToken;

import java.time.Instant;

public interface RefreshTokenProvider {
    RefreshToken issue(Instant expiresAt);

    RefreshToken identify(String value);

    void validate(RefreshToken token);

    String hash(String value);
}
