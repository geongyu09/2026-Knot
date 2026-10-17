package com.knot.backend.document.application.dto.result;

import com.knot.backend.document.domain.model.DocumentConfirmationState;
import java.time.Instant;

public record DocumentConfirmationItemResult(
        long memberId,
        String nickname,
        String profileImageUrl,
        Instant confirmedAt,
        DocumentConfirmationState state
) {
}
