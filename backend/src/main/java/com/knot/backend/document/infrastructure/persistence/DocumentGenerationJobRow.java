package com.knot.backend.document.infrastructure.persistence;

import com.knot.backend.document.domain.model.DocumentGenerationJobStatus;
import java.time.Instant;

record DocumentGenerationJobRow(
        long jobId,
        long recordingSessionId,
        DocumentGenerationJobStatus status,
        Instant createdAt,
        Instant updatedAt
) {

}
