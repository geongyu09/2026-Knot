package com.knot.backend.auth.domain;

import com.knot.backend.auth.domain.model.AuthenticatedMember;
import com.knot.backend.auth.domain.model.OAuthUser;

public interface AuthTokenProvider {

    String issue(AuthenticatedMember member);

    String issueNickname(OAuthUser oauthUser);

    AuthenticatedMember authenticate(String token);

    OAuthUser authenticateNickname(String token);
}
