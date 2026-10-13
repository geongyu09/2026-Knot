package com.knot.backend.recording.infrastructure.transcription;

import com.knot.backend.global.config.TranscriptionProperties;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import com.knot.backend.recording.domain.TranscriptionErrorCode;
import java.net.URI;
import java.time.Duration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class TranscriptionPropertiesTest {
    @Test
    @DisplayName("전사 기능이 비활성화되면 비밀값과 실행 설정이 없어도 부팅할 수 있다")
    void validate_success_disabled() {
        // given
        TranscriptionProperties properties = new TranscriptionProperties(
                false,
                null,
                null,
                null,
                null,
                null,
                null
        );

        // when
        Throwable thrown = catchThrowable(properties::validateEnabledConfiguration);

        // then
        assertThat(thrown).isNull();
    }

    @Test
    @DisplayName("HTTP 서버 주소와 양수인 모든 기한을 허용하고 설정 문자열에 토큰을 노출하지 않는다")
    void validate_success_enabled() {
        // given
        TranscriptionProperties properties = properties(
                "http://127.0.0.1:18765",
                "top-secret",
                Duration.ofSeconds(1)
        );

        // when
        Throwable thrown = catchThrowable(properties::validateEnabledConfiguration);

        // then
        assertThat(thrown).isNull();
        assertThat(properties.toString()).doesNotContain("top-secret");
    }

    @ParameterizedTest
    @ValueSource(strings = {"file:///tmp/ai", "http://user:password@localhost", "https://host/api",
            "http://host?token=secret", "https://host#fragment", "http://host:0", "http://host:65536"})
    @DisplayName("인증 정보와 경로 쿼리 조각이 섞인 서버 주소를 거절한다")
    void validate_failure_url(String url) {
        // given
        TranscriptionProperties properties = properties(
                url,
                "test-secret",
                Duration.ofSeconds(1)
        );

        // when
        Throwable thrown = catchThrowable(properties::validateEnabledConfiguration);

        // then
        assertThat(thrown).hasMessage(TranscriptionErrorCode.AI_INVALID_CONFIGURATION.getMessage());
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "secret\nheader", "secret\rheader", "토큰", "secret space"})
    @DisplayName("활성화된 전사 기능의 빈 토큰과 헤더 제어 문자를 거절한다")
    void validate_failure_token(String token) {
        // given
        TranscriptionProperties properties = properties(
                "http://localhost:18765",
                token,
                Duration.ofSeconds(1)
        );

        // when
        Throwable thrown = catchThrowable(properties::validateEnabledConfiguration);

        // then
        assertThat(thrown).hasMessage(TranscriptionErrorCode.AI_INVALID_CONFIGURATION.getMessage());
    }

    @ParameterizedTest
    @ValueSource(longs = {0, -1})
    @DisplayName("응답 기한은 양수여야 한다")
    void validate_failure_timeout(long millis) {
        // given
        TranscriptionProperties properties = properties(
                "http://localhost:18765",
                "test-secret",
                Duration.ofMillis(millis)
        );

        // when
        Throwable thrown = catchThrowable(properties::validateEnabledConfiguration);

        // then
        assertThat(thrown).hasMessage(TranscriptionErrorCode.AI_INVALID_CONFIGURATION.getMessage());
    }

    private TranscriptionProperties properties(
            String url,
            String token,
            Duration timeout
    ) {
        return new TranscriptionProperties(
                true,
                URI.create(url),
                token,
                Duration.ofSeconds(5),
                timeout,
                Duration.ofSeconds(2),
                Duration.ofHours(12)
        );
    }
}
