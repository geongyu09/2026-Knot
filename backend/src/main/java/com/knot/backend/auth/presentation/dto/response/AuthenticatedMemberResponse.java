package com.knot.backend.auth.presentation.dto.response;

import com.knot.backend.auth.domain.model.AuthenticatedMember;

public record AuthenticatedMemberResponse(
        long memberId,
        String nickname,
        String profileImageUrl
) {

    public static AuthenticatedMemberResponse from(AuthenticatedMember member) {
        return new AuthenticatedMemberResponse(
                member.getMemberId(),
                member.getNickname(),
                member.getProfileImageUrl()
        );
    }
}
