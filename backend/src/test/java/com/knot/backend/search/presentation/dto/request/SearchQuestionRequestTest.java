package com.knot.backend.search.presentation.dto.request;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;

class SearchQuestionRequestTest {

    private final JsonMapper json = JsonMapper.builder()
            .build();

    @Test
    @DisplayName("JSON 문자열 질문과 UUID를 변환하며 원문 공백을 보존한다")
    void toCommand_success() {
        SearchQuestionRequest request = json.readValue(
                """
                        {"content":" 질문 ","requestId":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"}
                        """,
                SearchQuestionRequest.class
        );
        assertThat(
                request.toCommand()
                        .content()
        ).isEqualTo(" 질문 ");
    }

    @ParameterizedTest
    @ValueSource(strings = {"123", "true", "[\"질문\"]", "{\"text\":\"질문\"}"})
    @DisplayName("JSON 숫자·불리언·배열·객체를 질문 문자열로 자동 변환하지 않는다")
    void toCommand_failure_nonStringContent(String value) {
        assertThatThrownBy(
                () -> json
                        .readValue(
                                "{\"content\":" + value + ",\"requestId\":\"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\"}",
                                SearchQuestionRequest.class
                        )
                        .toCommand()
        ).isInstanceOf(RuntimeException.class);
    }
}
