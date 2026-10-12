package com.knot.backend.search.application.dto.result;

import java.time.Instant;

public record SearchDocumentRecord(
        long documentId,
        String title,
        String topic,
        String content,
        Instant recordingStartedAt,
        Instant createdAt,
        Instant archivedAt,
        int score
) {
}
