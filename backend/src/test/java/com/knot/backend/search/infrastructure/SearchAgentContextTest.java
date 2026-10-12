package com.knot.backend.search.infrastructure;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import com.knot.backend.global.config.SearchAgentProperties;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class SearchAgentContextTest {

    @Test
    void validate_success_exactLimit() {
        ObjectMapper mapper = new ObjectMapper();
        List<Map<String, Object>> messages = List.of(
                Map.of(
                        "role",
                        "user",
                        "content",
                        "한글🙂"
                )
        );
        SearchAgentProperties properties = new SearchAgentProperties();
        properties.setContextCharacterLimit(
                mapper.writeValueAsString(messages)
                        .length()
        );
        assertThatCode(
                () -> new SearchAgentContext(
                        properties,
                        mapper
                ).validate(messages)
        ).doesNotThrowAnyException();
    }

    @Test
    void validate_failure_limitPlusOne() {
        ObjectMapper mapper = new ObjectMapper();
        List<Map<String, Object>> messages = List.of(
                Map.of(
                        "role",
                        "user",
                        "content",
                        "한글🙂"
                )
        );
        SearchAgentProperties properties = new SearchAgentProperties();
        properties.setContextCharacterLimit(
                mapper.writeValueAsString(messages)
                        .length() - 1
        );
        assertThatThrownBy(
                () -> new SearchAgentContext(
                        properties,
                        mapper
                ).validate(messages)
        ).hasMessage("SEARCH_CONTEXT_LIMIT_EXCEEDED");
    }
}
