package com.knot.backend.auth.infrastructure.persistence;

import com.knot.backend.auth.domain.model.OAuthIdentity;
import com.knot.backend.auth.domain.model.OAuthProvider;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OAuthIdentityJpaRepository extends JpaRepository<OAuthIdentity, Long> {

    Optional<OAuthIdentity> findByProviderAndProviderUserId(
            OAuthProvider provider,
            String providerUserId
    );
}
