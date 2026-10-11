package com.knot.backend.search.presentation;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.util.stream.Collectors;

final class SearchSseEventPayload {

    private SearchSseEventPayload() {}

    static JsonNode read(
            String event,
            JsonMapper mapper
    ) {
        String data = event.lines()
                .filter(line -> line.startsWith("data:"))
                .map(line -> line.substring(5))
                .collect(Collectors.joining("\n"));
        if (data.isEmpty()) {
            throw new IllegalArgumentException("SSE event has no data field");
        }
        return mapper.readTree(data);
    }
}
