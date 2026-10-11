package com.knot.backend.search.application.dto.result;

public record SearchDocumentResult(
        long documentId,
        String title,
        String topic,
        String content
) {
}
