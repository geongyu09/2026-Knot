package com.knot.backend.search.application.dto.result;

import java.time.Instant;

public record SearchDocumentCard(
        long documentId,
        String title,
        String topic,
        Instant recordingStartedAt,
        Instant createdAt,
        Instant archivedAt,
        String snippet,
        String contentRevision
) {
}
