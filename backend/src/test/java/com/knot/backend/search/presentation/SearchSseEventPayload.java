package com.knot.backend.search.presentation;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

final class SearchSseEventPayload {

    private SearchSseEventPayload() {}

    static JsonNode read(
            String event,
            JsonMapper mapper
    ) {
        return mapper.readTree(
                event.substring(event.indexOf("data:") + 5)
                        .trim()
        );
    }
}
