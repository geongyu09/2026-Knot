package com.knot.backend.search.infrastructure;

import com.knot.backend.global.config.SearchAgentProperties;
import com.knot.backend.search.domain.SearchToolException;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import tools.jackson.databind.ObjectMapper;

@RequiredArgsConstructor
public class SearchAgentContext {

    private final SearchAgentProperties properties;
    private final ObjectMapper mapper;

    public void validate(List<Map<String, Object>> messages) {
        if (mapper.writeValueAsString(messages)
                .length() > properties.getContextCharacterLimit()) {
            throw new SearchToolException("SEARCH_CONTEXT_LIMIT_EXCEEDED");
        }
    }
}
