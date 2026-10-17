package com.knot.backend.search.application.dto.result;

public record SearchDocumentSlice(
        SearchDocumentCard document,
        String content,
        int offset,
        boolean truncated,
        String nextCursor
) {
}
