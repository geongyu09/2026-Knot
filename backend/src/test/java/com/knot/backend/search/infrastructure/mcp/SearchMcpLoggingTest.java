package com.knot.backend.search.infrastructure.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import ch.qos.logback.classic.Level;
import com.knot.backend.global.config.SearchMcpConfig;
import com.knot.backend.search.application.SearchDocumentToolService;
import com.knot.backend.search.application.SearchToolAccess;
import com.knot.backend.search.application.SearchToolScope;
import com.knot.backend.search.domain.SearchToolException;
import com.knot.backend.testsupport.LogCapture;
import io.modelcontextprotocol.spec.McpSchema;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.json.JsonMapper;

class SearchMcpLoggingTest {

    @Test
    @DisplayName("MCP의 잘못된 인자는 무로그이며 서비스 내부 IllegalArgumentException은 ERROR다")
    void call_failure_distinguishesArgumentsFromService() {
        SearchDocumentToolService service = mock(SearchDocumentToolService.class);
        SearchMcpTools tools = new SearchMcpTools(
                service,
                JsonMapper.builder()
                        .build()
        );
        try (LogCapture logs = new LogCapture(SearchMcpTools.class)) {
            assertThat(
                    tools.call(
                            scope(),
                            new McpSchema.CallToolRequest(
                                    "search_documents",
                                    Map.of(
                                            "size",
                                            "bad"
                                    )
                            )
                    )
                            .isError()
            ).isTrue();
            assertThat(logs.events()).isEmpty();
            when(
                    service.list(
                            any(),
                            any()
                    )
            ).thenThrow(new IllegalArgumentException("private-sql"));
            assertThat(
                    tools.call(
                            scope(),
                            new McpSchema.CallToolRequest(
                                    "list_documents",
                                    Map.of()
                            )
                    )
                            .isError()
            ).isTrue();
            assertThat(logs.events()).singleElement()
                    .satisfies(event -> {
                        assertThat(event.getLevel()).isEqualTo(Level.ERROR);
                        assertThat(event.getFormattedMessage()).contains("IllegalArgumentException")
                                .doesNotContain("private-sql");
                    });
        }
    }

    @Test
    @DisplayName("MCP 필터가 401로 소비하는 내부 원인은 한 번 기록하고 기존 응답을 유지한다")
    void doFilter_failure_wrappedInternalCause() throws Exception {
        SearchToolTokenCodec tokens = mock(SearchToolTokenCodec.class);
        when(tokens.authenticate("private-bearer")).thenThrow(
                new SearchToolException(
                        "INVALID_TOOL_ARGUMENTS",
                        new IllegalStateException("private-sql")
                )
        );
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(
                "Authorization",
                "Bearer private-bearer"
        );
        MockHttpServletResponse response = new MockHttpServletResponse();
        try (LogCapture logs = new LogCapture(SearchMcpAuthenticationFilter.class)) {
            new SearchMcpAuthenticationFilter(
                    tokens,
                    mock(SearchToolAccess.class)
            ).doFilter(
                    request,
                    response,
                    mock(jakarta.servlet.FilterChain.class)
            );
            assertThat(response.getStatus()).isEqualTo(401);
            assertThat(logs.events()).singleElement()
                    .satisfies(event -> {
                        assertThat(event.getLevel()).isEqualTo(Level.ERROR);
                        assertThat(event.getFormattedMessage()).contains("IllegalStateException")
                                .doesNotContain(
                                        "private-bearer",
                                        "private-sql"
                                );
                    });
        }
    }

    @Test
    @DisplayName("MCP 접근 DB 오류는 필터에서 한 번 기록하고 원본을 전파한다")
    void doFilter_failure_accessPersistence() {
        SearchToolTokenCodec tokens = mock(SearchToolTokenCodec.class);
        when(tokens.authenticate("private-bearer")).thenReturn(scope());
        SearchToolAccess access = mock(SearchToolAccess.class);
        IllegalStateException failure = new IllegalStateException("private-sql");
        doThrow(failure).when(access)
                .validate(any());
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(
                "Authorization",
                "Bearer private-bearer"
        );
        try (LogCapture logs = new LogCapture(SearchMcpAuthenticationFilter.class)) {
            assertThatThrownBy(
                    () -> new SearchMcpAuthenticationFilter(
                            tokens,
                            access
                    ).doFilter(
                            request,
                            new MockHttpServletResponse(),
                            mock(jakarta.servlet.FilterChain.class)
                    )
            ).isSameAs(failure);
            assertThat(logs.events()).hasSize(1);
        }
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    @DisplayName("실제 MCP 라우터와 SDK를 거친 내부 도구 오류는 애플리케이션 경계에서 한 번 기록한다")
    void call_failure_realMcpTransport(boolean rethrown) throws Exception {
        SearchDocumentToolService service = mock(SearchDocumentToolService.class);
        when(
                service.list(
                        any(),
                        any()
                )
        ).thenThrow(transportFailure(rethrown));
        SearchMcpConfig configuration = new SearchMcpConfig();
        org.springframework.ai.mcp.server.webmvc.transport.WebMvcStatelessServerTransport transport = configuration
                .searchMcpTransport();
        io.modelcontextprotocol.server.McpStatelessSyncServer server = configuration.searchMcpServer(
                transport,
                new SearchMcpTools(
                        service,
                        JsonMapper.builder()
                                .build()
                )
        );
        try {
            MockMvc mvc = MockMvcBuilders.routerFunctions(
                    configuration.searchMcpRoutes(
                            transport,
                            server
                    )
            )
                    .build();
            try (LogCapture logs = new LogCapture(
                    SearchMcpTools.class,
                    SearchMcpAuthenticationFilter.class,
                    com.knot.backend.global.exception.GlobalExceptionHandler.class
            )) {
                org.springframework.test.web.servlet.MvcResult result = mvc.perform(
                        post("/internal/mcp").requestAttr(
                                SearchMcpAuthenticationFilter.SCOPE_ATTRIBUTE,
                                scope()
                        )
                                .contentType("application/json")
                                .accept(
                                        "application/json",
                                        "text/event-stream"
                                )
                                .header(
                                        "MCP-Protocol-Version",
                                        "2025-03-26"
                                )
                                .content(
                                        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"list_documents\",\"arguments\":{}}}"
                                )
                )
                        .andReturn();
                assertThat(
                        result.getResponse()
                                .getStatus()
                ).isEqualTo(200);
                assertTransportResponse(
                        result,
                        rethrown
                );
                assertThat(logs.events()).singleElement()
                        .satisfies(event -> {
                            assertThat(event.getLevel()).isEqualTo(Level.ERROR);
                            assertThat(event.getFormattedMessage()).doesNotContain("private-sql");
                        });
            }
        } finally {
            server.close();
        }
    }

    private SearchToolScope scope() {
        Instant now = Instant.parse("2026-10-12T00:00:00Z");
        return new SearchToolScope(
                1,
                2,
                3,
                4,
                5,
                UUID.randomUUID(),
                now,
                now.plusSeconds(60)
        );
    }

    private RuntimeException transportFailure(boolean rethrown) {
        if (rethrown) {
            return new IllegalStateException("private-sql");
        }
        return new IllegalArgumentException("private-sql");
    }

    private void assertTransportResponse(
            org.springframework.test.web.servlet.MvcResult result,
            boolean rethrown
    ) throws Exception {
        String body = result.getResponse()
                .getContentAsString();
        if (rethrown) {
            assertThat(body).contains(
                    "\"error\"",
                    "\"code\":-32603"
            );
            return;
        }
        assertThat(body).contains(
                "INVALID_TOOL_ARGUMENTS",
                "\"isError\":true"
        );
    }
}
