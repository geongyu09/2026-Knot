package com.knot.backend.global.config;

import com.knot.backend.recording.domain.RecordingErrorCode;
import com.knot.backend.recording.domain.RecordingException;
import java.time.Duration;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "knot.retention")
public class RetentionCleanupProperties {
    private boolean enabled;
    private int candidateLimit = 20;
    private Duration executionLease = Duration.ofMinutes(2);

    public void validate() {
        if (candidateLimit < 1 || candidateLimit > 100) {
            throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_DATA);
        }
        validateDuration(executionLease);
        validateExecutionLease();
    }

    private void validateExecutionLease() {
        if (executionLease.compareTo(Duration.ofSeconds(75)) < 0 || executionLease.compareTo(Duration.ofHours(1)) > 0) {
            throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_TIME);
        }
    }

    private void validateDuration(Duration duration) {
        if (duration == null || duration.isNegative() || duration.isZero()) {
            throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_TIME);
        }
    }
}
