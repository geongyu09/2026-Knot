package com.knot.backend.recording.infrastructure.transcription;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import com.knot.backend.global.config.TranscriptionProperties;
import com.knot.backend.recording.domain.RecordingErrorCode;
import java.net.URI;
import java.time.Duration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class TranscriptionPropertiesTest {
    @Test
    @DisplayName("전사 기능이 비활성화되면 실행 설정이 없어도 부팅할 수 있다")
    void validate_success_disabled() {
        // given
        TranscriptionProperties transcriptionProperties = new TranscriptionProperties(
                false,
                null,
                null,
                null,
                null,
                null,
                null
        );

        // when
        Throwable thrown = catchThrowable(transcriptionProperties::validateEnabledConfiguration);

        // then
        assertThat(thrown).isNull();
    }

    @Test
    @DisplayName("활성화된 HTTP 서버 설정을 허용하며 설정 문자열에 토큰을 노출하지 않는다")
    void validate_success_enabled() {
        // given
        TranscriptionProperties transcriptionProperties = transcriptionProperties(
                "http://127.0.0.1:18765",
                "top-secret",
                Duration.ofSeconds(1)
        );

        // when
        Throwable thrown = catchThrowable(transcriptionProperties::validateEnabledConfiguration);

        // then
        assertThat(thrown).isNull();
        assertThat(transcriptionProperties.toString()).doesNotContain("top-secret");
    }

    @ParameterizedTest
    @ValueSource(strings = {"file:///tmp/ai", "http:/missing-host"})
    @DisplayName("HTTP 서버가 아닌 기본 주소는 시작 시 거절한다")
    void validate_failure_url(String url) {
        // given
        TranscriptionProperties transcriptionProperties = transcriptionProperties(
                url,
                "test-secret",
                Duration.ofSeconds(1)
        );

        // when
        Throwable thrown = catchThrowable(transcriptionProperties::validateEnabledConfiguration);

        // then
        assertThat(thrown).hasMessage(RecordingErrorCode.AI_INVALID_CONFIGURATION.getMessage());
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" "})
    @DisplayName("활성화된 전사 기능에는 인증 토큰이 필요하다")
    void validate_failure_token(String token) {
        // given
        TranscriptionProperties transcriptionProperties = transcriptionProperties(
                "http://localhost:18765",
                token,
                Duration.ofSeconds(1)
        );

        // when
        Throwable thrown = catchThrowable(transcriptionProperties::validateEnabledConfiguration);

        // then
        assertThat(thrown).hasMessage(RecordingErrorCode.AI_INVALID_CONFIGURATION.getMessage());
    }

    @ParameterizedTest
    @ValueSource(longs = {0, -1})
    @DisplayName("응답 기한은 양수여야 한다")
    void validate_failure_timeout(long millis) {
        // given
        TranscriptionProperties transcriptionProperties = transcriptionProperties(
                "http://localhost:18765",
                "test-secret",
                Duration.ofMillis(millis)
        );

        // when
        Throwable thrown = catchThrowable(transcriptionProperties::validateEnabledConfiguration);

        // then
        assertThat(thrown).hasMessage(RecordingErrorCode.AI_INVALID_CONFIGURATION.getMessage());
    }

    private TranscriptionProperties transcriptionProperties(
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
