package com.knot.backend.search.application.dto.result;

import com.knot.backend.search.domain.SearchErrorCode;
import com.knot.backend.search.domain.SearchException;
import java.util.List;

public record SearchRetrievalResult(
        List<SearchDocumentResult> documents,
        int excludedCount,
        String directAnswer
) {
    public SearchRetrievalResult(
            List<SearchDocumentResult> documents,
            int excludedCount
    ) {
        this(
                documents,
                excludedCount,
                null
        );
    }

    public SearchRetrievalResult {
        documents = List.copyOf(documents);
        if (excludedCount < 0) {
            throw new SearchException(SearchErrorCode.INVALID_SEARCH_STATE);
        }
        if (directAnswer != null && directAnswer.isBlank()) {
            throw new SearchException(SearchErrorCode.INVALID_SEARCH_STATE);
        }
        if (directAnswer != null && (!documents.isEmpty() || excludedCount != 0)) {
            throw new SearchException(SearchErrorCode.INVALID_SEARCH_STATE);
        }
    }
}
