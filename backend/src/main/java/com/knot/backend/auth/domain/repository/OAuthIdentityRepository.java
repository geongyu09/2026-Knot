package com.knot.backend.auth.domain.repository;

import com.knot.backend.auth.domain.model.OAuthIdentity;
import com.knot.backend.auth.domain.model.OAuthProvider;

import java.util.Optional;

public interface OAuthIdentityRepository {

    Optional<OAuthIdentity> findByProviderAndProviderUserId(
            OAuthProvider provider,
            String providerUserId
    );

    OAuthIdentity save(OAuthIdentity identity);
}
