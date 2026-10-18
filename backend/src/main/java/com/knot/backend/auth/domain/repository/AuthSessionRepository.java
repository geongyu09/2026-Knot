package com.knot.backend.auth.domain.repository;

import com.knot.backend.auth.domain.model.AuthSession;

import java.util.Optional;

public interface AuthSessionRepository {

    AuthSession save(AuthSession session);

    Optional<AuthSession> findByRefreshTokenHash(String refreshTokenHash);

    Optional<AuthSession> findByRefreshTokenHashForUpdate(String refreshTokenHash);

    Optional<AuthSession> findByIdForUpdate(long authSessionId);
}
