package com.knot.backend.search.application.dto.result;

import com.knot.backend.document.domain.DocumentStatus;
import java.time.Instant;

public record SearchDocumentCard(
        long documentId,
        String title,
        String topic,
        DocumentStatus status,
        Instant recordingStartedAt,
        Instant createdAt,
        Instant archivedAt,
        String snippet,
        String contentRevision
) {
}
