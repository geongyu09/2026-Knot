package com.knot.backend.document.infrastructure.persistence;

import java.time.Instant;

record DocumentConfirmationTargetRow(
        long memberId,
        String nickname,
        String profileImageUrl,
        Instant confirmedAt,
        boolean activeMember
) {
}
