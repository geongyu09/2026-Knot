package com.knot.backend.search.infrastructure.persistence;

public record SearchEvidenceRow(
        long messageId,
        long documentId,
        String title,
        String topic,
        int rank
) {
}
