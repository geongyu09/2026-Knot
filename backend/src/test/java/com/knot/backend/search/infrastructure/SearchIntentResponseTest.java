package com.knot.backend.search.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.knot.backend.search.domain.SearchIntent;
import com.knot.backend.search.domain.SearchToolException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;

class SearchIntentResponseTest {

    private final JsonMapper mapper = JsonMapper.builder()
            .build();

    @ParameterizedTest
    @EnumSource(SearchIntent.class)
    @DisplayName("허용된 의도 하나를 엄격한 JSON에서 읽는다")
    void parse_success_knownIntent(SearchIntent intent) {
        assertThat(
                SearchIntentResponse.parse(
                        mapper,
                        "{\"intent\":\"" + intent.name() + "\"}"
                )
        ).isEqualTo(intent);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "null", "[]", "{}", "{\"intent\":null}", "{\"intent\":1}", "{\"intent\":\"SEARCH\"}",
            "{\"intent\":\"MEETING_SEARCH\",\"answer\":\"케이크\"}",
            "{\"intent\":\"OUT_OF_SCOPE\",\"intent\":\"MEETING_SEARCH\"}", "{\"intent\":\"OUT_OF_SCOPE\"} {}",
            "```json\n{\"intent\":\"OUT_OF_SCOPE\"}\n```"})
    @DisplayName("의도 누락·추가 필드·중복 키·추가 JSON을 거부한다")
    void parse_failure_invalidJson(String content) {
        assertThatThrownBy(
                () -> SearchIntentResponse.parse(
                        mapper,
                        content
                )
        ).isInstanceOf(SearchToolException.class)
                .hasMessage("INVALID_INTENT_RESPONSE");
    }
}
