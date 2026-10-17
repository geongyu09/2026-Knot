package com.knot.backend.document.infrastructure.persistence;

import com.knot.backend.document.domain.model.DocumentStatus;
import java.time.Instant;

record DocumentCardRow(
        long id,
        long recordingSessionId,
        String topic,
        String title,
        String summary,
        DocumentStatus status,
        Instant createdAt,
        long recordingDurationMillis,
        boolean requiredByMe,
        Instant confirmedAtByMe
) {
}
