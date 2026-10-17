package com.knot.backend.search.application;

import com.knot.backend.search.application.dto.result.SearchRetrievalResult;

public interface SearchDocumentRetriever {

    SearchRetrievalResult retrieve(
            SearchToolScope scope,
            String question
    );
}
