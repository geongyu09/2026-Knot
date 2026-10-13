package com.knot.backend.global.config;

import com.knot.backend.recording.domain.TranscriptionErrorCode;
import com.knot.backend.recording.domain.TranscriptionException;
import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "knot.transcription")
public record TranscriptionProperties(
        boolean enabled,
        URI baseUrl,
        String token,
        Duration connectTimeout,
        Duration requestTimeout,
        Duration pollInterval,
        Duration jobTimeout
) {
    public void validateEnabledConfiguration() {
        if (!enabled) {
            return;
        }
        if (baseUrl == null || !("http".equals(baseUrl.getScheme()) || "https".equals(baseUrl.getScheme()))
                || baseUrl.getHost() == null || baseUrl.getPort() == 0 || baseUrl.getPort() > 65535
                || baseUrl.getUserInfo() != null || baseUrl.getQuery() != null || baseUrl.getFragment() != null
                || !(baseUrl.getPath()
                        .isEmpty() || "/".equals(baseUrl.getPath()))
                || token == null || token.isBlank() || token.chars()
                        .anyMatch(value -> value <= 32 || value >= 127)
                || invalid(connectTimeout) || invalid(requestTimeout) || invalid(pollInterval) || invalid(jobTimeout)) {
            throw new TranscriptionException(TranscriptionErrorCode.AI_INVALID_CONFIGURATION);
        }
    }
    private boolean invalid(Duration duration) {
        if (duration == null || duration.isNegative() || duration.isZero()) {
            return true;
        }
        try {
            return duration.toMillis() < 1;
        } catch (ArithmeticException exception) {
            return true;
        }
    }
    @Override
    public String toString() {
        return "TranscriptionProperties[enabled=" + enabled + ", token=REDACTED]";
    }
}
