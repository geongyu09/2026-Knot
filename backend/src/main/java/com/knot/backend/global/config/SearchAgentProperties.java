package com.knot.backend.global.config;

import java.net.URI;
import java.time.Duration;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "knot.search.agent")
public class SearchAgentProperties {

    private boolean enabled;
    private String signingKey;
    private URI mcpBaseUrl = URI.create("http://127.0.0.1:8080");
    private Duration budget = Duration.ofSeconds(120);
    private int toolCallLimit = 12;
    private int readCodePoints = 6000;
    private int contextCharacterLimit = 48000;

    public void validate() {
        if (signingKey == null || signingKey.length() < 32) {
            throw new IllegalStateException("search signing key must contain at least 32 characters");
        }
        if (budget == null || budget.isNegative() || budget.isZero()) {
            throw new IllegalStateException("search budget must be positive");
        }
        if (toolCallLimit < 1 || toolCallLimit > 100) {
            throw new IllegalStateException("invalid tool call limit");
        }
        if (readCodePoints < 1 || readCodePoints > 12000) {
            throw new IllegalStateException("invalid document slice limit");
        }
        if (contextCharacterLimit < readCodePoints || contextCharacterLimit > 200000) {
            throw new IllegalStateException("invalid search context limit");
        }
        validateOrigin();
    }

    private void validateOrigin() {
        if (mcpBaseUrl == null || mcpBaseUrl.getHost() == null || mcpBaseUrl.getUserInfo() != null) {
            throw new IllegalStateException("invalid MCP origin");
        }
        if (mcpBaseUrl.getQuery() != null || mcpBaseUrl.getFragment() != null) {
            throw new IllegalStateException("invalid MCP origin components");
        }
        String path = mcpBaseUrl.getPath();
        if (path != null && !path.isEmpty() && !path.equals("/")) {
            throw new IllegalStateException("MCP URL must be an origin");
        }
        if ("https".equals(mcpBaseUrl.getScheme())) {
            return;
        }
        if ("http".equals(mcpBaseUrl.getScheme()) && "127.0.0.1".equals(mcpBaseUrl.getHost())) {
            return;
        }
        throw new IllegalStateException("MCP must use HTTPS or IPv4 loopback HTTP");
    }
}
