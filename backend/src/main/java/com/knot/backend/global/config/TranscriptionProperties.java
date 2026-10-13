package com.knot.backend.global.config;

import com.knot.backend.recording.domain.RecordingErrorCode;
import com.knot.backend.recording.domain.RecordingException;
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
                || baseUrl.getHost() == null || token == null || token.isBlank() || invalid(connectTimeout)
                || invalid(requestTimeout) || invalid(pollInterval) || invalid(jobTimeout)) {
            throw new RecordingException(RecordingErrorCode.AI_INVALID_CONFIGURATION);
        }
    }
    private boolean invalid(Duration duration) {
        return duration == null || duration.isNegative() || duration.isZero();
    }
    @Override
    public String toString() {
        return "TranscriptionProperties[enabled=" + enabled + ", token=REDACTED]";
    }
}
