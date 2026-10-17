package com.knot.backend.search.application.dto.result;

import com.knot.backend.search.domain.SearchErrorCode;
import com.knot.backend.search.domain.SearchException;
import java.util.List;

public record SearchRetrievalResult(
        List<SearchDocumentResult> documents,
        int excludedCount
) {
    public SearchRetrievalResult {
        documents = List.copyOf(documents);
        if (excludedCount < 0) {
            throw new SearchException(SearchErrorCode.INVALID_SEARCH_STATE);
        }
    }
}
