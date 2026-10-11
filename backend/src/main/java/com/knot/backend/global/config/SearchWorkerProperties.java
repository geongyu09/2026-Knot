package com.knot.backend.global.config;

import java.time.Duration;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "knot.search.worker")
public class SearchWorkerProperties {

    private boolean enabled;
    private int concurrency = 2;
    private int candidateLimit = 20;
    private Duration pollInterval = Duration.ofSeconds(1);
    private Duration executionLease = Duration.ofSeconds(150);
    private Duration streamPollInterval = Duration.ofMillis(100);
    private Duration streamTimeout = Duration.ofMinutes(3);
    private Duration streamHeartbeatInterval = Duration.ofSeconds(15);
    private int streamConcurrency = 8;

    public void validate() {
        validateConcurrency();
        validateCandidateLimit();
        validateStreamConcurrency();
        validateDuration(pollInterval);
        validateDuration(executionLease);
        validateDuration(streamPollInterval);
        validateDuration(streamTimeout);
        validateDuration(streamHeartbeatInterval);
    }

    private void validateConcurrency() {
        if (concurrency < 1 || concurrency > 16) {
            throw new IllegalArgumentException("invalid search worker concurrency");
        }
    }

    private void validateCandidateLimit() {
        if (candidateLimit < concurrency || candidateLimit > 100) {
            throw new IllegalArgumentException("invalid search worker candidate limit");
        }
    }

    private void validateStreamConcurrency() {
        if (streamConcurrency < 1 || streamConcurrency > 100) {
            throw new IllegalArgumentException("invalid search stream capacity");
        }
    }

    private void validateDuration(Duration duration) {
        if (duration == null || duration.isNegative() || duration.isZero() || duration.toMillis() < 1) {
            throw new IllegalArgumentException("invalid search worker duration");
        }
    }
}
