package com.knot.backend.global.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import com.knot.backend.recording.domain.RecordingException;
import java.time.Duration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RetentionCleanupPropertiesTest {

    @Test
    @DisplayName("보존 정리는 기본 비활성이고 기본 삭제 실행 기한은 2분이다")
    void validate_success_defaultsDisabled() {
        // given
        RetentionCleanupProperties properties = new RetentionCleanupProperties();

        // when
        properties.validate();

        // then
        assertThat(properties.isEnabled()).isFalse();
        assertThat(properties.getExecutionLease()).isEqualTo(Duration.ofMinutes(2));
    }

    @Test
    @DisplayName("저장소 삭제 제한 시간보다 짧은 실행 기한은 거절한다")
    void validate_failure_executionLeaseShorterThanDeletionTimeout() {
        // given
        RetentionCleanupProperties properties = new RetentionCleanupProperties();
        properties.setExecutionLease(Duration.ofSeconds(60));

        // when
        Throwable failure = catchThrowable(properties::validate);

        // then
        assertThat(failure).isInstanceOf(RecordingException.class);
    }

    @Test
    @DisplayName("한 번에 처리할 후보 수가 1보다 작으면 거절한다")
    void validate_failure_candidateLimitBelowOne() {
        // given
        RetentionCleanupProperties properties = new RetentionCleanupProperties();
        properties.setCandidateLimit(0);

        // when
        Throwable failure = catchThrowable(properties::validate);

        // then
        assertThat(failure).isInstanceOf(RecordingException.class);
    }
}
