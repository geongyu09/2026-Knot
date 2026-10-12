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
    @DisplayName("공급자의 SSE를 UTF8 delta로 전달한다")
    void stream_success_utf8() throws Exception {
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
    }

    @Test
    @DisplayName("DONE 없이 끊긴 스트림은 실패한다")
    void stream_failure_truncated() throws Exception {
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

    @Test
    @DisplayName("응답 헤더 뒤 본문이 멈춰도 전체 작업 기한 안에 연결을 종료한다")
    void stream_failure_bodyDeadline() throws Exception {
        try (LlmHttpServer server = new LlmHttpServer(); SearchAgentHttp http = transport()) {
            server.respond(exchange -> {
                exchange.sendResponseHeaders(
                        200,
                        0
                );
                exchange.getResponseBody()
                        .flush();
                try {
                    new java.util.concurrent.CountDownLatch(1).await(
                            3,
                            java.util.concurrent.TimeUnit.SECONDS
                    );
                } catch (InterruptedException exception) {
                    Thread.currentThread()
                            .interrupt();
                }
            });
            Instant now = Instant.now();
            SearchToolScope deadline = new SearchToolScope(
                    1,
                    1,
                    1,
                    1,
                    2,
                    UUID.randomUUID(),
                    now,
                    now.plusMillis(500)
            );
            long started = System.nanoTime();
            assertThatThrownBy(
                    () -> client(
                            server,
                            http
                    ).stream(
                            deadline,
                            List.of(),
                            text -> {
                            }
                    )
            ).isInstanceOf(com.knot.backend.search.domain.SearchToolException.class);
            assertThat(java.time.Duration.ofNanos(System.nanoTime() - started))
                    .isLessThan(java.time.Duration.ofSeconds(2));
        }
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.MethodSource("invalidStreamEvents")
    void stream_failure_providerErrors(
            String event,
            String code
    ) throws Exception {
        try (LlmHttpServer server = new LlmHttpServer(); SearchAgentHttp http = transport()) {
            server.respond(
                    200,
                    "data: " + event + "\n\ndata: [DONE]\n\n"
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
            ).isInstanceOf(com.knot.backend.search.domain.SearchToolException.class)
                    .hasMessage(code);
        }
    }

    private static java.util.stream.Stream<org.junit.jupiter.params.provider.Arguments> invalidStreamEvents() {
        return java.util.stream.Stream.of(
                org.junit.jupiter.params.provider.Arguments.of(
                        "{\"error\":{\"message\":\"provider failed\"}}",
                        "MODEL_GENERATION_FAILED"
                ),
                org.junit.jupiter.params.provider.Arguments.of(
                        "{\"choices\":[{\"finish_reason\":\"length\",\"delta\":{}}]}",
                        "INCOMPLETE_MODEL_STREAM"
                ),
                org.junit.jupiter.params.provider.Arguments.of(
                        "{\"choices\":[{\"finish_reason\":\"content_filter\",\"delta\":{}}]}",
                        "INCOMPLETE_MODEL_STREAM"
                ),
                org.junit.jupiter.params.provider.Arguments.of(
                        "{\"choices\":[{\"delta\":{\"tool_calls\":[]}}]}",
                        "UNEXPECTED_MODEL_TOOL_CALL"
                ),
                org.junit.jupiter.params.provider.Arguments.of(
                        "{}",
                        "INVALID_MODEL_RESPONSE"
                )
        );
    }

    @Test
    void complete_failure_missingChoices() throws Exception {
        try (LlmHttpServer server = new LlmHttpServer(); SearchAgentHttp http = transport()) {
            server.respond(
                    200,
                    "{}"
            );
            assertThatThrownBy(
                    () -> client(
                            server,
                            http
                    ).complete(
                            scope(),
                            List.of(),
                            List.of()
                    )
            ).isInstanceOf(com.knot.backend.search.domain.SearchToolException.class)
                    .hasMessage("INVALID_MODEL_RESPONSE");
        }
    }

    @Test
    void evidence_success_requestsStrictJsonSchema() throws Exception {
        try (LlmHttpServer server = new LlmHttpServer(); SearchAgentHttp http = transport()) {
            server.respond(
                    200,
                    "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"{}\"}}]}"
            );
            client(
                    server,
                    http
            ).evidence(
                    scope(),
                    List.of()
            );
            var body = JsonMapper.builder()
                    .build()
                    .readTree(server.requestBody());
            var format = body.path("response_format");
            assertThat(
                    format.path("type")
                            .asString()
            ).isEqualTo("json_schema");
            assertThat(
                    format.path("json_schema")
                            .path("strict")
                            .asBoolean()
            ).isTrue();
            assertThat(
                    format.path("json_schema")
                            .path("schema")
                            .path("additionalProperties")
                            .asBoolean(true)
            ).isFalse();
            assertThat(
                    body.path("stream")
                            .asBoolean(true)
            ).isFalse();
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
