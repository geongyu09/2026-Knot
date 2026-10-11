package com.knot.backend.search.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import com.knot.backend.global.config.LlmProperties;
import com.knot.backend.search.application.SearchToolScope;
import com.knot.backend.testsupport.LlmHttpServer;
import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class SearchLlmClientTest {

    @Test
    @DisplayName("도구 호출 요청은 모델 tools를 전달하고 공급자의 tool_calls를 그대로 돌려준다")
    void complete_success_nativeToolCalls() throws Exception {
        try (LlmHttpServer server = new LlmHttpServer(); SearchAgentHttp http = transport()) {
            server.respond(
                    200,
                    "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"tool_calls\":[{\"id\":\"t1\",\"type\":\"function\",\"function\":{\"name\":\"list_documents\",\"arguments\":\"{}\"}}]}}]}"
            );
            SearchLlmClient client = client(
                    server,
                    http
            );
            assertThat(
                    client.complete(
                            scope(),
                            List.of(
                                    Map.of(
                                            "role",
                                            "user",
                                            "content",
                                            "질문"
                                    )
                            ),
                            List.of(
                                    Map.of(
                                            "type",
                                            "function",
                                            "function",
                                            Map.of(
                                                    "name",
                                                    "list_documents"
                                            )
                                    )
                            )
                    )
                            .path("tool_calls")
            ).hasSize(1);
            assertThat(server.requestBody()).contains(
                    "tools",
                    "list_documents",
                    "질문"
            );
            assertThat(server.authorization()).isEqualTo("Bearer test-token");
        }
    }

    @Test
    @DisplayName("공급자의 SSE를 UTF8 delta로 전달하고 DONE 없이 끊긴 스트림은 실패한다")
    void stream_success_utf8AndFailureOnTruncation() throws Exception {
        try (LlmHttpServer server = new LlmHttpServer(); SearchAgentHttp http = transport()) {
            server.respond(
                    200,
                    "data: {\"choices\":[{\"delta\":{\"content\":\"한글 😀\"}}]}\n\ndata: [DONE]\n\n"
            );
            List<String> parts = new ArrayList<>();
            client(
                    server,
                    http
            ).stream(
                    scope(),
                    List.of(
                            Map.of(
                                    "role",
                                    "user",
                                    "content",
                                    "질문"
                            )
                    ),
                    parts::add
            );
            assertThat(parts).containsExactly("한글 😀");
            assertThat(server.requestBody()).contains("\"stream\":true");
        }
        try (LlmHttpServer server = new LlmHttpServer(); SearchAgentHttp http = transport()) {
            server.respond(
                    200,
                    "data: {\"choices\":[{\"delta\":{\"content\":\"부분\"}}]}\n\n"
            );
            assertThatThrownBy(
                    () -> client(
                            server,
                            http
                    ).stream(
                            scope(),
                            List.of(),
                            text -> {
                            }
                    )
            ).hasMessage("INCOMPLETE_MODEL_STREAM");
        }
    }

    private SearchAgentHttp transport() {
        return new SearchAgentHttp(
                HttpClient.newBuilder()
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .build(),
                JsonMapper.builder()
                        .build(),
                Clock.systemUTC(),
                262144
        );
    }

    private SearchLlmClient client(
            LlmHttpServer server,
            SearchAgentHttp http
    ) {
        LlmProperties properties = new LlmProperties();
        properties.setBaseUrl(server.baseUrl());
        properties.setApiToken("test-token");
        properties.setModel("test-model");
        return new SearchLlmClient(
                http,
                properties
        );
    }

    private SearchToolScope scope() {
        Instant now = Instant.now();
        return new SearchToolScope(
                1,
                1,
                1,
                1,
                2,
                UUID.randomUUID(),
                now,
                now.plusSeconds(10)
        );
    }
}
