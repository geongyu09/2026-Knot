package com.knot.backend.auth.application;

import com.knot.backend.auth.domain.AuthErrorCode;
import com.knot.backend.auth.domain.AuthException;
import com.knot.backend.auth.domain.model.OAuthIdentity;
import com.knot.backend.auth.domain.repository.OAuthIdentityRepository;
import com.knot.backend.auth.domain.model.OAuthProvider;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class OAuthIdentityService {
    private final OAuthIdentityRepository oauthIdentityRepository;

    @Transactional(readOnly = true)
    public Optional<OAuthIdentity> findByProviderAndProviderUserId(
            OAuthProvider provider,
            String providerUserId
    ) {
        if (provider == null || providerUserId == null || providerUserId.isBlank()) {
            throw new AuthException(AuthErrorCode.INVALID_OAUTH_USER);
        }

        return oauthIdentityRepository.findByProviderAndProviderUserId(
                provider,
                providerUserId
        );
    }

    @Transactional
    public OAuthIdentity save(OAuthIdentity identity) {
        if (identity == null) {
            throw new AuthException(AuthErrorCode.INVALID_OAUTH_USER);
        }

        return oauthIdentityRepository.save(identity);
    }
}
