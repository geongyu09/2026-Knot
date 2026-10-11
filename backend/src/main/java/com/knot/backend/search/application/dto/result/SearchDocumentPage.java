package com.knot.backend.search.application.dto.result;

import java.util.List;

public record SearchDocumentPage(
        List<SearchDocumentCard> items,
        String nextCursor
) {

    public SearchDocumentPage {
        items = List.copyOf(items);
    }
}
