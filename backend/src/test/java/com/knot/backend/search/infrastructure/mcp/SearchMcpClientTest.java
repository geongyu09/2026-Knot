package com.knot.backend.search.infrastructure.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.knot.backend.global.config.SearchAgentProperties;
import com.knot.backend.search.application.SearchToolScope;
import com.knot.backend.search.domain.SearchToolException;
import com.knot.backend.search.infrastructure.SearchAgentHttp;
import com.knot.backend.testsupport.LlmHttpServer;
import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.ObjectMapper;

class SearchMcpClientTest {
    private static final Instant NOW = Instant.parse("2026-10-12T00:00:00Z");

    private final ObjectMapper mapper = new ObjectMapper();
    private final Clock clock = Clock.fixed(
            NOW,
            ZoneOffset.UTC
    );
    private final SearchToolScope scope = new SearchToolScope(
            1,
            2,
            3,
            4,
            5,
            UUID.randomUUID(),
            NOW,
            NOW.plusSeconds(120)
    );
    private SearchAgentHttp http;
    private SearchMcpClient client;

    @BeforeEach
    void setUp() {
        http = mock(SearchAgentHttp.class);
        SearchAgentProperties properties = new SearchAgentProperties();
        properties.setSigningKey("test-signing-key-32-characters-minimum");
        client = new SearchMcpClient(
                http,
                new SearchToolTokenCodec(
                        mapper,
                        properties,
                        clock
                ),
                properties,
                mapper
        );
    }

    @Test
    void definitions_success_initializeNotificationAndThreeTools() {
        var tools = List.of(
                tool("search_documents"),
                tool("list_documents"),
                tool("read_document")
        );
        when(
                http.json(
                        any(),
                        anyString(),
                        any(),
                        any(),
                        anyMap()
                )
        ).thenReturn(
                response(
                        1,
                        Map.of(
                                "protocolVersion",
                                "2025-06-18"
                        )
                ),
                response(
                        2,
                        Map.of(
                                "tools",
                                tools
                        )
                )
        );
        assertThat(client.definitions(scope)).hasSize(3);
        verify(http).notification(
                any(),
                anyString(),
                org.mockito.ArgumentMatchers.eq(
                        Map.of(
                                "jsonrpc",
                                "2.0",
                                "method",
                                "notifications/initialized"
                        )
                ),
                org.mockito.ArgumentMatchers.eq(scope),
                anyMap()
        );
    }

    @Test
    void call_success_structuredContent() {
        when(
                http.json(
                        any(),
                        anyString(),
                        any(),
                        any(),
                        anyMap()
                )
        ).thenReturn(
                response(
                        1,
                        Map.of(
                                "structuredContent",
                                Map.of(
                                        "content",
                                        "회의 결정"
                                )
                        )
                )
        );
        assertThat(
                client.call(
                        scope,
                        "read_document",
                        Map.of(
                                "documentId",
                                7
                        )
                )
                        .path("content")
                        .asString()
        ).isEqualTo("회의 결정");
    }

    @ParameterizedTest
    @ValueSource(strings = {"ID", "RPC_ERROR", "PROTOCOL", "TOOLS"})
    void definitions_failure_invalidProtocolResponse(String scenario) {
        if ("ID".equals(scenario)) {
            when(
                    http.json(
                            any(),
                            anyString(),
                            any(),
                            any(),
                            anyMap()
                    )
            ).thenReturn(
                    response(
                            99,
                            Map.of()
                    )
            );
        }
        if ("RPC_ERROR".equals(scenario)) {
            when(
                    http.json(
                            any(),
                            anyString(),
                            any(),
                            any(),
                            anyMap()
                    )
            ).thenReturn(
                    mapper.valueToTree(
                            Map.of(
                                    "id",
                                    1,
                                    "error",
                                    Map.of(
                                            "code",
                                            -32600
                                    )
                            )
                    )
            );
        }
        if ("PROTOCOL".equals(scenario)) {
            when(
                    http.json(
                            any(),
                            anyString(),
                            any(),
                            any(),
                            anyMap()
                    )
            ).thenReturn(
                    response(
                            1,
                            Map.of(
                                    "protocolVersion",
                                    "unsupported"
                            )
                    )
            );
        }
        if ("TOOLS".equals(scenario)) {
            when(
                    http.json(
                            any(),
                            anyString(),
                            any(),
                            any(),
                            anyMap()
                    )
            ).thenReturn(
                    response(
                            1,
                            Map.of(
                                    "protocolVersion",
                                    "2025-06-18"
                            )
                    ),
                    response(
                            2,
                            Map.of(
                                    "tools",
                                    List.of()
                            )
                    )
            );
        }
        assertThatThrownBy(() -> client.definitions(scope)).isInstanceOf(SearchToolException.class)
                .hasMessage(error(scenario));
    }

    @Test
    void call_failure_toolError() {
        when(
                http.json(
                        any(),
                        anyString(),
                        any(),
                        any(),
                        anyMap()
                )
        ).thenReturn(
                response(
                        1,
                        Map.of(
                                "isError",
                                true
                        )
                )
        );
        assertThatThrownBy(
                () -> client.call(
                        scope,
                        "read_document",
                        Map.of(
                                "documentId",
                                7
                        )
                )
        ).isInstanceOf(SearchToolException.class)
                .hasMessage("MCP_TOOL_FAILED");
    }

    @Test
    void json_failure_responseByteLimit() throws Exception {
        try (LlmHttpServer server = new LlmHttpServer();
                com.knot.backend.search.infrastructure.SearchTransportCancellation cancellation = new com.knot.backend.search.infrastructure.SearchTransportCancellation(
                        mock(com.knot.backend.search.application.SearchToolAccess.class),
                        java.time.Duration.ofMillis(250)
                );
                SearchAgentHttp transport = new SearchAgentHttp(
                        HttpClient.newHttpClient(),
                        mapper,
                        clock,
                        32,
                        cancellation
                )) {
            server.respond(
                    200,
                    "{\"content\":\"" + "가".repeat(32) + "\"}"
            );
            assertThatThrownBy(
                    () -> transport.json(
                            server.baseUrl()
                                    .resolve("/v1/chat/completions"),
                            "test-token",
                            Map.of(),
                            scope,
                            Map.of()
                    )
            ).isInstanceOf(SearchToolException.class)
                    .hasMessage("TRANSPORT_RESPONSE_TOO_LARGE");
        }
    }

    private Map<String, Object> tool(String name) {
        return Map.of(
                "name",
                name,
                "description",
                "문서 도구",
                "inputSchema",
                Map.of(
                        "type",
                        "object"
                )
        );
    }

    private tools.jackson.databind.JsonNode response(
            long id,
            Map<String, Object> result
    ) {
        return mapper.valueToTree(
                Map.of(
                        "jsonrpc",
                        "2.0",
                        "id",
                        id,
                        "result",
                        result
                )
        );
    }

    private String error(String scenario) {
        if ("PROTOCOL".equals(scenario)) {
            return "UNSUPPORTED_MCP_PROTOCOL";
        }
        if ("TOOLS".equals(scenario)) {
            return "INVALID_MCP_TOOLS";
        }
        return "INVALID_MCP_RESPONSE";
    }
}
