package com.knot.backend.search.application;

import com.knot.backend.global.config.SearchAgentProperties;
import com.knot.backend.search.application.dto.query.SearchDocumentCursor;
import com.knot.backend.search.application.dto.query.SearchDocumentParameters;
import com.knot.backend.search.application.dto.result.SearchDocumentCard;
import com.knot.backend.search.application.dto.result.SearchDocumentPage;
import com.knot.backend.search.application.dto.result.SearchDocumentSlice;
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

    public SearchDocumentSlice read(
            SearchToolScope scope,
            long documentId,
            String encoded
    ) {
        access.validate(scope);
        if (documentId <= 0) {
            throw new SearchToolException("INVALID_TOOL_ARGUMENTS");
        }
        SearchDocumentRecord row = query.find(
                scope,
                documentId
        )
                .orElseThrow(() -> new SearchToolException("DOCUMENT_NOT_FOUND"));
        String binding = tokens.binding(
                scope,
                new SearchDocumentParameters(
                        null,
                        null,
                        null,
                        null,
                        null,
                        20
                ),
                "read:" + documentId
        );
        String revision = tokens.revision(row.content());
        int offset = readOffset(
                encoded,
                binding,
                revision
        );
        String content = row.content();
        int length = content.codePointCount(
                0,
                content.length()
        );
        if (offset > length) {
            throw new SearchToolException("INVALID_TOOL_ARGUMENTS");
        }
        int end = Math.min(
                length,
                offset + properties.getReadCodePoints()
        );
        String next = readCursor(
                row,
                binding,
                revision,
                end,
                length
        );
        return new SearchDocumentSlice(
                card(row),
                content.substring(
                        content.offsetByCodePoints(
                                0,
                                offset
                        ),
                        content.offsetByCodePoints(
                                0,
                                end
                        )
                ),
                offset,
                end < length,
                next
        );
    }

    private int readOffset(
            String encoded,
            String binding,
            String revision
    ) {
        if (encoded == null) {
            return 0;
        }
        SearchDocumentCursor cursor = cursor(
                encoded,
                binding
        );
        if (!revision.equals(cursor.revision())) {
            throw new SearchToolException("DOCUMENT_CHANGED");
        }
        if (cursor.offset() <= 0) {
            throw new SearchToolException("INVALID_TOOL_ARGUMENTS");
        }
        return cursor.offset();
    }

    private String readCursor(
            SearchDocumentRecord row,
            String binding,
            String revision,
            int end,
            int length
    ) {
        if (end == length) {
            return null;
        }
        return tokens.encode(
                "knot-search-cursor",
                new SearchDocumentCursor(
                        binding,
                        0,
                        row.recordingStartedAt(),
                        row.documentId(),
                        end,
                        revision
                )
        );
    }

    public SearchDocumentPage search(
            SearchToolScope scope,
            SearchDocumentParameters parameters
    ) {
        access.validate(scope);
        if (parameters.query() == null) {
            throw new SearchToolException("INVALID_TOOL_ARGUMENTS");
        }
        String binding = tokens.binding(
                scope,
                parameters,
                "search"
        );
        SearchDocumentCursor cursor = cursor(
                parameters.cursor(),
                binding
        );
        return page(
                query.searchPage(
                        scope,
                        parameters,
                        cursor
                ),
                parameters.size(),
                binding
        );
    }

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
