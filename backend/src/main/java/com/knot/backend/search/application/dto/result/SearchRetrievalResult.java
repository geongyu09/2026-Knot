package com.knot.backend.search.application.dto.result;

import java.util.List;

public record SearchRetrievalResult(
        List<SearchDocumentResult> documents,
        int excludedCount
) {
    public SearchRetrievalResult {
        documents = List.copyOf(documents);
        if (excludedCount < 0) {
            throw new IllegalArgumentException("excludedCount must be nonnegative");
        }
    }
}
