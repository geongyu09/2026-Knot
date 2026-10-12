package com.knot.backend.search.application;

import com.knot.backend.search.application.dto.query.SearchDocumentParameters;

public interface SearchToolTokens {

    String encode(
            String purpose,
            Object value
    );

    <T> T decode(
            String purpose,
            String encoded,
            Class<T> type
    );

    String binding(
            SearchToolScope scope,
            SearchDocumentParameters parameters,
            String purpose
    );

    String revision(String content);
}
