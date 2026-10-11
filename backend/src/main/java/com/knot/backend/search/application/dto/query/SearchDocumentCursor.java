package com.knot.backend.search.application.dto.query;

import java.time.Instant;

public record SearchDocumentCursor(
        String binding,
        int score,
        Instant recordedAt,
        long documentId,
        int offset,
        String revision
) {
}
