package com.knot.backend.document.application.dto.result;

import com.knot.backend.document.domain.model.DocumentStatus;
import com.knot.backend.document.domain.model.MyConfirmationState;
import java.time.Instant;

public record DocumentCardResult(
        long id,
        long recordingSessionId,
        String topic,
        String title,
        String summary,
        DocumentStatus status,
        Instant createdAt,
        int recordingDurationSeconds,
        MyConfirmationState myConfirmationState,
        DocumentConfirmationSummaryResult confirmationSummary
) {
}
