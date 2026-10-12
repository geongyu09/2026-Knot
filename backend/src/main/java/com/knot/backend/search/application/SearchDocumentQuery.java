package com.knot.backend.search.application;

import com.knot.backend.search.application.dto.query.SearchDocumentCursor;
import com.knot.backend.search.application.dto.query.SearchDocumentParameters;
import com.knot.backend.search.application.dto.result.SearchDocumentRecord;
import java.util.List;

public interface SearchDocumentQuery {

    java.util.Optional<SearchDocumentRecord> find(
            SearchToolScope scope,
            long documentId
    );

    List<SearchDocumentRecord> searchPage(
            SearchToolScope scope,
            SearchDocumentParameters parameters,
            SearchDocumentCursor cursor
    );

    List<SearchDocumentRecord> listPage(
            SearchToolScope scope,
            SearchDocumentParameters parameters,
            SearchDocumentCursor cursor
    );
}
