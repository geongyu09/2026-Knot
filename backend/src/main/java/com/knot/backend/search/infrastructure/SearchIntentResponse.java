package com.knot.backend.search.infrastructure;

import com.knot.backend.search.domain.SearchIntent;
import com.knot.backend.search.domain.SearchToolException;
import tools.jackson.core.JacksonException;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

final class SearchIntentResponse {

    private SearchIntentResponse() {}

    static SearchIntent parse(
            ObjectMapper mapper,
            String content
    ) {
        JsonNode response = read(
                mapper,
                content
        );
        if (response == null || !response.isObject() || response.size() != 1) {
            throw new SearchToolException("INVALID_INTENT_RESPONSE");
        }
        JsonNode intent = response.path("intent");
        if (!intent.isString()) {
            throw new SearchToolException("INVALID_INTENT_RESPONSE");
        }
        for (SearchIntent candidate : SearchIntent.values()) {
            if (candidate.name()
                    .equals(intent.asString())) {
                return candidate;
            }
        }
        throw new SearchToolException("INVALID_INTENT_RESPONSE");
    }

    private static JsonNode read(
            ObjectMapper mapper,
            String content
    ) {
        try {
            return mapper.reader()
                    .with(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                    .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                    .readTree(content);
        } catch (JacksonException exception) {
            throw new SearchToolException(
                    "INVALID_INTENT_RESPONSE",
                    exception
            );
        }
    }
}
