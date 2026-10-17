package com.knot.backend.document.application.dto.result;

import com.knot.backend.document.domain.model.DocumentGenerationJobStatus;
import java.time.Instant;

public record DocumentGenerationJobItemResult(
        long jobId,
        long recordingSessionId,
        DocumentGenerationJobStatus status,
        Instant createdAt,
        Instant updatedAt
) {

}
