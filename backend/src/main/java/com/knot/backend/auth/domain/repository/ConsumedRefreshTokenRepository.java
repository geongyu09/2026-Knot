package com.knot.backend.auth.domain.repository;

import com.knot.backend.auth.domain.model.ConsumedRefreshToken;

import java.util.Optional;

public interface ConsumedRefreshTokenRepository {

    ConsumedRefreshToken save(ConsumedRefreshToken consumedRefreshToken);

    Optional<ConsumedRefreshToken> findByRefreshTokenHash(String refreshTokenHash);
}
