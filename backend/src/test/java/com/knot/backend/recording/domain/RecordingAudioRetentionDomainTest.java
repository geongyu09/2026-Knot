package com.knot.backend.recording.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RecordingAudioRetentionDomainTest {
    private static final Instant NOW = Instant.parse("2026-10-09T00:00:00Z");

    @Test
    @DisplayName("오디오 보존 만료는 최초 업로드 완료 확인부터 30일이 되기 직전까지 오지 않는다")
    void isRetentionExpired_success_falseJustBeforeBoundary() {
        // given
        RecordingAudioUpload upload = completedUpload();
        Instant expires = retentionBoundary();

        // when
        boolean expired = upload.isRetentionExpired(expires.minusNanos(1000));

        // then
        assertThat(expired).isFalse();
    }

    @Test
    @DisplayName("오디오 보존은 최초 업로드 완료 확인부터 정확히 30일에 만료된다")
    void isRetentionExpired_success_trueAtBoundary() {
        // given
        RecordingAudioUpload upload = completedUpload();
        Instant expires = retentionBoundary();

        // when
        boolean expired = upload.isRetentionExpired(expires);

        // then
        assertThat(expired).isTrue();
    }

    @Test
    @DisplayName("보존 삭제를 다시 기록해도 처음 삭제 시각과 완료 정보를 유지한다")
    void recordDeleted_success_keepsFirstDeletedAt() {
        // given
        RecordingAudioUpload upload = completedUpload();
        Instant expires = retentionBoundary();
        upload.recordDeleted(expires);

        // when
        upload.recordDeleted(expires.plusSeconds(1));

        // then
        assertThat(upload.getDeletedAt()).isEqualTo(expires);
        assertThat(upload.isCompleted()).isTrue();
        assertThat(upload.getCompletedAt()).isEqualTo(NOW.plusSeconds(60));
    }

    @Test
    @DisplayName("예약만 된 오디오는 30일이 지나도 보존 만료로 보지 않는다")
    void isRetentionExpired_success_falseWhenReserved() {
        // given
        RecordingAudioUpload upload = reservedUpload();

        // when
        boolean expired = upload.isRetentionExpired(NOW.plus(Duration.ofDays(31)));

        // then
        assertThat(expired).isFalse();
    }

    @Test
    @DisplayName("예약만 된 오디오는 보존 삭제로 기록하지 않는다")
    void recordDeleted_failure_uncompletedUpload() {
        // given
        RecordingAudioUpload upload = reservedUpload();

        // when
        Throwable failure = catchThrowable(() -> upload.recordDeleted(NOW));

        // then
        assertThat(failure).isInstanceOf(RecordingException.class);
    }

    private RecordingAudioUpload reservedUpload() {
        return RecordingAudioUpload.reserve(
                1L,
                "key",
                "audio/webm",
                100,
                NOW
        );
    }

    private RecordingAudioUpload completedUpload() {
        RecordingAudioUpload upload = reservedUpload();
        upload.complete(
                StoredAudioObject.of(
                        100,
                        "audio/webm",
                        "version-1"
                ),
                NOW.plusSeconds(60)
        );
        return upload;
    }

    private Instant retentionBoundary() {
        return NOW.plusSeconds(60)
                .plus(Duration.ofDays(30));
    }
}
