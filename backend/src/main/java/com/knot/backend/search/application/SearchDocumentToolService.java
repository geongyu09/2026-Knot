package com.knot.backend.search.application;

import com.knot.backend.global.config.SearchAgentProperties;
import com.knot.backend.search.application.dto.query.SearchDocumentCursor;
import com.knot.backend.search.application.dto.query.SearchDocumentParameters;
import com.knot.backend.search.application.dto.result.SearchDocumentCard;
import com.knot.backend.search.application.dto.result.SearchDocumentPage;
import com.knot.backend.search.domain.SearchToolException;
import com.knot.backend.search.application.dto.result.SearchDocumentRecord;
import java.util.List;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class SearchDocumentToolService {

    private final SearchDocumentQuery query;
    private final SearchToolAccess access;
    private final SearchToolTokens tokens;
    private final SearchAgentProperties properties;

    public SearchDocumentPage list(
            SearchToolScope scope,
            SearchDocumentParameters parameters
    ) {
        access.validate(scope);
        String binding = tokens.binding(
                scope,
                parameters,
                "list"
        );
        SearchDocumentCursor cursor = cursor(
                parameters.cursor(),
                binding
        );
        List<SearchDocumentRecord> rows = query.listPage(
                scope,
                parameters,
                cursor
        );
        return page(
                rows,
                parameters.size(),
                binding
        );
    }

    private SearchDocumentCursor cursor(
            String encoded,
            String binding
    ) {
        if (encoded == null) {
            return null;
        }
        SearchDocumentCursor cursor = tokens.decode(
                "knot-search-cursor",
                encoded,
                SearchDocumentCursor.class
        );
        if (!binding.equals(cursor.binding()) || cursor.recordedAt() == null || cursor.documentId() <= 0) {
            throw new SearchToolException("INVALID_TOOL_ARGUMENTS");
        }
        return cursor;
    }

    private SearchDocumentPage page(
            List<SearchDocumentRecord> rows,
            int size,
            String binding
    ) {
        int count = Math.min(
                rows.size(),
                size
        );
        List<SearchDocumentRecord> selected = rows.subList(
                0,
                count
        );
        String next = nextCursor(
                rows,
                selected,
                size,
                binding
        );
        return new SearchDocumentPage(
                selected.stream()
                        .map(this::card)
                        .toList(),
                next
        );
    }

    private String nextCursor(
            List<SearchDocumentRecord> rows,
            List<SearchDocumentRecord> selected,
            int size,
            String binding
    ) {
        if (rows.size() <= size) {
            return null;
        }
        SearchDocumentRecord last = selected.getLast();
        return tokens.encode(
                "knot-search-cursor",
                new SearchDocumentCursor(
                        binding,
                        last.score(),
                        last.recordingStartedAt(),
                        last.documentId(),
                        0,
                        null
                )
        );
    }

    private SearchDocumentCard card(SearchDocumentRecord row) {
        return new SearchDocumentCard(
                row.documentId(),
                row.title(),
                row.topic(),
                row.recordingStartedAt(),
                row.createdAt(),
                row.archivedAt(),
                excerpt(row.content()),
                tokens.revision(row.content())
        );
    }

    private String excerpt(String text) {
        int count = Math.min(
                200,
                text.codePointCount(
                        0,
                        text.length()
                )
        );
        return text.substring(
                0,
                text.offsetByCodePoints(
                        0,
                        count
                )
        );
    }
}
