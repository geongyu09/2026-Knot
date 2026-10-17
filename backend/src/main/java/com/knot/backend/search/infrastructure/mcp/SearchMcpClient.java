package com.knot.backend.search.infrastructure.mcp;

import com.knot.backend.global.config.SearchAgentProperties;
import com.knot.backend.search.application.SearchToolScope;
import com.knot.backend.search.domain.SearchToolException;
import com.knot.backend.search.infrastructure.llm.SearchAgentHttp;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@RequiredArgsConstructor
@Slf4j
public class SearchMcpClient {
    private static final Map<String, String> HEADERS = Map.of(
            "Accept",
            "application/json, text/event-stream",
            "MCP-Protocol-Version",
            "2025-06-18"
    );

    private final SearchAgentHttp http;
    private final SearchToolTokenCodec tokens;
    private final SearchAgentProperties properties;
    private final ObjectMapper mapper;
    private final AtomicLong ids = new AtomicLong();

    public List<Map<String, Object>> definitions(SearchToolScope scope) {
        JsonNode initialized = rpc(
                scope,
                "initialize",
                Map.of(
                        "protocolVersion",
                        "2025-06-18",
                        "capabilities",
                        Map.of(),
                        "clientInfo",
                        Map.of(
                                "name",
                                "knot-search-executor",
                                "version",
                                "1.0.0"
                        )
                ),
                null
        );
        if (!"2025-06-18".equals(
                initialized.path("protocolVersion")
                        .asString()
        )) {
            throw new SearchToolException("UNSUPPORTED_MCP_PROTOCOL");
        }
        notifyInitialized(scope);
        JsonNode tools = rpc(
                scope,
                "tools/list",
                Map.of(),
                null
        ).path("tools");
        if (!tools.isArray() || tools.size() != 3) {
            throw new SearchToolException("INVALID_MCP_TOOLS");
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (JsonNode tool : tools) {
            result.add(
                    Map.of(
                            "type",
                            "function",
                            "function",
                            Map.of(
                                    "name",
                                    tool.path("name")
                                            .asString(),
                                    "description",
                                    tool.path("description")
                                            .asString(),
                                    "parameters",
                                    mapper.convertValue(
                                            tool.path("inputSchema"),
                                            Map.class
                                    )
                            )
                    )
            );
        }
        return List.copyOf(result);
    }

    public JsonNode call(
            SearchToolScope scope,
            String name,
            Map<String, Object> arguments
    ) {
        if (!List.of(
                "search_documents",
                "list_documents",
                "read_document"
        )
                .contains(name)) {
            throw new SearchToolException("UNKNOWN_TOOL");
        }
        JsonNode result = rpc(
                scope,
                "tools/call",
                Map.of(
                        "name",
                        name,
                        "arguments",
                        arguments
                ),
                name
        );
        if (result.path("isError")
                .asBoolean(false)) {
            throw new SearchToolException("MCP_TOOL_FAILED");
        }
        JsonNode content = result.path("structuredContent");
        if (!content.isObject()) {
            throw new SearchToolException("INVALID_MCP_RESPONSE");
        }
        return content;
    }

    private JsonNode rpc(
            SearchToolScope scope,
            String method,
            Map<String, Object> params,
            String toolName
    ) {
        URI endpoint = properties.getMcpBaseUrl()
                .resolve("/internal/mcp");
        long id = ids.incrementAndGet();
        long started = System.nanoTime();
        try {
            JsonNode response = http.json(
                    endpoint,
                    tokens.encode(
                            "knot-search-mcp",
                            scope
                    ),
                    Map.of(
                            "jsonrpc",
                            "2.0",
                            "id",
                            id,
                            "method",
                            method,
                            "params",
                            params
                    ),
                    scope,
                    HEADERS
            );
            if (response.has("error") || response.path("id")
                    .asLong() != id || !response.path("result")
                            .isObject()) {
                throw new SearchToolException("INVALID_MCP_RESPONSE");
            }
            logRpc(
                    scope,
                    method,
                    toolName,
                    (System.nanoTime() - started) / 1_000_000,
                    "success"
            );
            return response.path("result");
        } catch (RuntimeException exception) {
            logRpc(
                    scope,
                    method,
                    toolName,
                    (System.nanoTime() - started) / 1_000_000,
                    "failure"
            );
            throw exception;
        }
    }

    private void notifyInitialized(SearchToolScope scope) {
        long started = System.nanoTime();
        try {
            http.notification(
                    properties.getMcpBaseUrl()
                            .resolve("/internal/mcp"),
                    tokens.encode(
                            "knot-search-mcp",
                            scope
                    ),
                    Map.of(
                            "jsonrpc",
                            "2.0",
                            "method",
                            "notifications/initialized"
                    ),
                    scope,
                    HEADERS
            );
            log.info(
                    "Search latency phase=mcp_handshake operation=notifications_initialized workspaceId={} answerId={} elapsedMs={} outcome=success",
                    scope.workspaceId(),
                    scope.answerId(),
                    (System.nanoTime() - started) / 1_000_000
            );
        } catch (RuntimeException exception) {
            log.info(
                    "Search latency phase=mcp_handshake operation=notifications_initialized workspaceId={} answerId={} elapsedMs={} outcome=failure",
                    scope.workspaceId(),
                    scope.answerId(),
                    (System.nanoTime() - started) / 1_000_000
            );
            throw exception;
        }
    }

    private void logRpc(
            SearchToolScope scope,
            String method,
            String toolName,
            long elapsedMs,
            String outcome
    ) {
        if ("tools/call".equals(method)) {
            log.info(
                    "Search latency phase=mcp_call toolName={} workspaceId={} answerId={} elapsedMs={} outcome={}",
                    toolName,
                    scope.workspaceId(),
                    scope.answerId(),
                    elapsedMs,
                    outcome
            );
            return;
        }
        log.info(
                "Search latency phase=mcp_handshake operation={} workspaceId={} answerId={} elapsedMs={} outcome={}",
                method,
                scope.workspaceId(),
                scope.answerId(),
                elapsedMs,
                outcome
        );
    }
}
