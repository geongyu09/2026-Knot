package com.knot.backend.search.infrastructure;

import com.knot.backend.global.config.LlmProperties;
import com.knot.backend.search.application.SearchToolScope;
import com.knot.backend.search.domain.SearchToolException;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import lombok.RequiredArgsConstructor;
import tools.jackson.databind.JsonNode;

@RequiredArgsConstructor
public class SearchLlmClient {

    private final SearchAgentHttp http;
    private final LlmProperties properties;

    public JsonNode complete(
            SearchToolScope scope,
            List<Map<String, Object>> messages,
            List<Map<String, Object>> tools
    ) {
        Map<String, Object> body = body(
                messages,
                false
        );
        if (!tools.isEmpty()) {
            body.put(
                    "tools",
                    tools
            );
            body.put(
                    "tool_choice",
                    "auto"
            );
        }
        return message(
                http.json(
                        endpoint(),
                        properties.getApiToken(),
                        body,
                        scope,
                        Map.of()
                )
        );
    }

    public JsonNode evidence(
            SearchToolScope scope,
            List<Map<String, Object>> messages
    ) {
        Map<String, Object> body = body(
                messages,
                false
        );
        body.put(
                "response_format",
                Map.of(
                        "type",
                        "json_schema",
                        "json_schema",
                        Map.of(
                                "name",
                                "evidence",
                                "strict",
                                true,
                                "schema",
                                Map.of(
                                        "type",
                                        "object",
                                        "properties",
                                        Map.of(
                                                "usedDocumentIds",
                                                Map.of(
                                                        "type",
                                                        "array",
                                                        "items",
                                                        Map.of(
                                                                "type",
                                                                "integer"
                                                        )
                                                )
                                        ),
                                        "required",
                                        List.of("usedDocumentIds"),
                                        "additionalProperties",
                                        false
                                )
                        )
                )
        );
        return message(
                http.json(
                        endpoint(),
                        properties.getApiToken(),
                        body,
                        scope,
                        Map.of()
                )
        );
    }

    public void stream(
            SearchToolScope scope,
            List<Map<String, Object>> messages,
            Consumer<String> onDelta
    ) {
        http.stream(
                endpoint(),
                properties.getApiToken(),
                body(
                        messages,
                        true
                ),
                scope,
                event -> {
                    if (event.has("error")) {
                        throw new SearchToolException("MODEL_GENERATION_FAILED");
                    }
                    JsonNode choice = firstChoice(event);
                    String finish = choice.path("finish_reason")
                            .asString("");
                    if ("length".equals(finish) || "content_filter".equals(finish)) {
                        throw new SearchToolException("INCOMPLETE_MODEL_STREAM");
                    }
                    JsonNode delta = choice.path("delta");
                    if (delta.has("tool_calls")) {
                        throw new SearchToolException("UNEXPECTED_MODEL_TOOL_CALL");
                    }
                    String text = delta.path("content")
                            .asString("");
                    if (!text.isEmpty()) {
                        onDelta.accept(text);
                    }
                }
        );
    }

    private Map<String, Object> body(
            List<Map<String, Object>> messages,
            boolean stream
    ) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put(
                "model",
                properties.getModel()
        );
        result.put(
                "messages",
                messages
        );
        result.put(
                "stream",
                stream
        );
        result.put(
                "temperature",
                0
        );
        result.put(
                "chat_template_kwargs",
                Map.of(
                        "enable_thinking",
                        false
                )
        );
        result.put(
                "reasoning",
                Map.of(
                        "enabled",
                        false
                )
        );
        return result;
    }

    private JsonNode message(JsonNode response) {
        JsonNode message = firstChoice(response).path("message");
        if (!message.isObject()) {
            throw new SearchToolException("INVALID_MODEL_RESPONSE");
        }
        return message;
    }

    private JsonNode firstChoice(JsonNode response) {
        JsonNode choices = response.path("choices");
        if (!choices.isArray() || choices.isEmpty()) {
            throw new SearchToolException("INVALID_MODEL_RESPONSE");
        }
        return choices.get(0);
    }

    private URI endpoint() {
        return properties.getBaseUrl()
                .resolve("/v1/chat/completions");
    }
}
