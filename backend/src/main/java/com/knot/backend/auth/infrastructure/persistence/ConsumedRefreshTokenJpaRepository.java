package com.knot.backend.auth.infrastructure.persistence;

import com.knot.backend.auth.domain.model.ConsumedRefreshToken;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

interface ConsumedRefreshTokenJpaRepository extends JpaRepository<ConsumedRefreshToken, Long> {
    Optional<ConsumedRefreshToken> findByRefreshTokenHash(String refreshTokenHash);
}
