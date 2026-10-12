package com.knot.backend.search.infrastructure.mcp;

import com.knot.backend.global.config.SearchAgentProperties;
import com.knot.backend.search.application.SearchToolScope;
import com.knot.backend.search.domain.SearchToolException;
import com.knot.backend.search.infrastructure.SearchAgentHttp;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import lombok.RequiredArgsConstructor;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@RequiredArgsConstructor
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
                )
        );
        if (!"2025-06-18".equals(
                initialized.path("protocolVersion")
                        .asString()
        )) {
            throw new SearchToolException("UNSUPPORTED_MCP_PROTOCOL");
        }
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
        JsonNode tools = rpc(
                scope,
                "tools/list",
                Map.of()
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
                )
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
            Map<String, Object> params
    ) {
        URI endpoint = properties.getMcpBaseUrl()
                .resolve("/internal/mcp");
        long id = ids.incrementAndGet();
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
        return response.path("result");
    }
}
