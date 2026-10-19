package com.knot.backend.search.presentation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.core.exc.StreamReadException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class SearchSseEventPayloadTest {

    private final JsonMapper mapper = JsonMapper.builder()
            .build();

    @ParameterizedTest
    @ValueSource(strings = {"event:delta\ndata:{\"text\":\"이어짐 😀\"}\n",
            "event:delta\ndata:{\"text\":\"이어짐 😀\"}\n:keepalive\n",
            "data:{\"text\":\"이어짐 😀\"}\nevent:delta\nid:2\nretry:1000\n",
            "event:delta\ndata:{\ndata: \"text\":\"이어짐 😀\"\ndata:}\n"})
    @DisplayName("SSE data 필드만 합쳐 읽고 주석과 이벤트 메타데이터는 JSON에 넣지 않는다")
    void read_success_dataFieldsOnly(String event) {
        // when
        JsonNode payload = SearchSseEventPayload.read(
                event,
                mapper
        );

        // then
        assertThat(
                payload.get("text")
                        .asString()
        ).isEqualTo("이어짐 😀");
    }

    @Test
    @DisplayName("data 필드 없는 heartbeat를 JSON 이벤트로 읽으면 거절한다")
    void read_failure_missingData() {
        // when & then
        assertThatThrownBy(
                () -> SearchSseEventPayload.read(
                        ":keepalive\n",
                        mapper
                )
        ).isInstanceOf(IllegalArgumentException.class)
                .hasMessage("SSE event has no data field");
    }

    @Test
    @DisplayName("잘린 JSON은 정상 이벤트로 처리하지 않는다")
    void read_failure_truncatedJson() {
        // when & then
        assertThatThrownBy(
                () -> SearchSseEventPayload.read(
                        "event:delta\ndata:{\"text\":",
                        mapper
                )
        ).isInstanceOf(StreamReadException.class);
    }
}
