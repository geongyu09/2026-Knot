package com.knot.backend.recording.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RecordingTranscriptionTest {
    private static final Instant START = Instant.parse("2026-10-13T00:00:00Z");
    private static final UUID ATTEMPT = UUID.fromString("00000000-0000-0000-0000-000000000639");

    @Test
    @DisplayName("작업은 원문과 실패 원인이 없는 실행 상태로 시작한다")
    void processing_success_initialState() {
        // when
        RecordingTranscription transcription = RecordingTranscription.processing(
                1,
                ATTEMPT,
                START
        );
        // then
        assertThat(transcription.getRecordingSessionId()).isEqualTo(1);
        assertThat(transcription.getAttemptId()).isEqualTo(ATTEMPT);
        assertThat(transcription.getStatus()).isEqualTo(TranscriptionStatus.PROCESSING);
        assertThat(transcription.getFailureCode()).isNull();
        assertThat(transcription.getTranscriptId()).isNull();
        assertThat(transcription.getFinishedAt()).isNull();
    }

    @Test
    @DisplayName("현재 시도만 성공하며 늦은 실패로 성공 결과를 덮어쓰지 않는다")
    void succeed_success_preservesTerminalState() {
        // given
        RecordingTranscription transcription = RecordingTranscription.processing(
                1,
                ATTEMPT,
                START
        );
        // when
        boolean succeeded = transcription.succeed(
                ATTEMPT,
                81,
                START.plusSeconds(1)
        );
        boolean failed = transcription.fail(
                ATTEMPT,
                "TIMEOUT",
                START.plusSeconds(2)
        );
        // then
        assertThat(succeeded).isTrue();
        assertThat(failed).isFalse();
        assertThat(transcription.getStatus()).isEqualTo(TranscriptionStatus.SUCCEEDED);
        assertThat(transcription.getTranscriptId()).isEqualTo(81);
        assertThat(transcription.getFailureCode()).isNull();
    }

    @Test
    @DisplayName("실패한 작업을 새 시도로 재시도하면 이전 실패 정보가 지워진다")
    void retry_success_newAttempt() {
        // given
        RecordingTranscription transcription = RecordingTranscription.processing(
                1,
                ATTEMPT,
                START
        );
        transcription.fail(
                ATTEMPT,
                "BUSY",
                START
        );
        UUID next = UUID.randomUUID();
        // when
        transcription.retry(
                next,
                START.plusSeconds(1)
        );
        // then
        assertThat(transcription.getAttemptId()).isEqualTo(next);
        assertThat(transcription.getStatus()).isEqualTo(TranscriptionStatus.PROCESSING);
        assertThat(transcription.getFailureCode()).isNull();
        assertThat(transcription.getFinishedAt()).isNull();
    }

    @Test
    @DisplayName("이전 시도의 늦은 결과와 실패 통지는 현재 시도를 바꾸지 않는다")
    void complete_success_ignoresPreviousAttempt() {
        // given
        RecordingTranscription transcription = RecordingTranscription.processing(
                1,
                ATTEMPT,
                START
        );
        transcription.fail(
                ATTEMPT,
                "TIMEOUT",
                START
        );
        UUID next = UUID.randomUUID();
        transcription.retry(
                next,
                START.plusSeconds(1)
        );
        // when
        boolean succeeded = transcription.succeed(
                ATTEMPT,
                81,
                START.plusSeconds(2)
        );
        boolean failed = transcription.fail(
                ATTEMPT,
                "LATE",
                START.plusSeconds(2)
        );
        // then
        assertThat(succeeded).isFalse();
        assertThat(failed).isFalse();
        assertThat(transcription.isProcessing(next)).isTrue();
    }

    @Test
    @DisplayName("실행 중인 작업은 재시도할 수 없다")
    void retry_failure_processing() {
        // given
        RecordingTranscription transcription = RecordingTranscription.processing(
                1,
                ATTEMPT,
                START
        );
        // when
        Throwable failure = catchThrowable(
                () -> transcription.retry(
                        UUID.randomUUID(),
                        START.plusSeconds(1)
                )
        );
        // then
        assertThat(failure).isInstanceOf(RecordingException.class);
    }

    @Test
    @DisplayName("성공한 작업은 재시도할 수 없다")
    void retry_failure_succeeded() {
        // given
        RecordingTranscription transcription = RecordingTranscription.processing(
                1,
                ATTEMPT,
                START
        );
        transcription.succeed(
                ATTEMPT,
                81,
                START
        );
        // when
        Throwable failure = catchThrowable(
                () -> transcription.retry(
                        UUID.randomUUID(),
                        START.plusSeconds(1)
                )
        );
        // then
        assertThat(failure).isInstanceOf(RecordingException.class);
    }

    @Test
    @DisplayName("재시도에 같은 식별자를 재사용하지 않는다")
    void retry_failure_sameAttempt() {
        // given
        RecordingTranscription transcription = RecordingTranscription.processing(
                1,
                ATTEMPT,
                START
        );
        transcription.fail(
                ATTEMPT,
                "TIMEOUT",
                START
        );
        // when
        Throwable failure = catchThrowable(
                () -> transcription.retry(
                        ATTEMPT,
                        START.plusSeconds(1)
                )
        );
        // then
        assertThat(failure).isInstanceOf(RecordingException.class);
    }

    @Test
    @DisplayName("시작 전 종료 시각은 거부한다")
    void fail_failure_beforeStart() {
        // given
        RecordingTranscription transcription = RecordingTranscription.processing(
                1,
                ATTEMPT,
                START
        );
        // when
        Throwable failure = catchThrowable(
                () -> transcription.fail(
                        ATTEMPT,
                        "TIMEOUT",
                        START.minusSeconds(1)
                )
        );
        // then
        assertThat(failure).isInstanceOf(RecordingException.class);
    }

    @Test
    @DisplayName("빈 실패 코드는 저장하지 않는다")
    void fail_failure_blankCode() {
        // given
        RecordingTranscription transcription = RecordingTranscription.processing(
                1,
                ATTEMPT,
                START
        );
        // when
        Throwable failure = catchThrowable(
                () -> transcription.fail(
                        ATTEMPT,
                        " ",
                        START
                )
        );
        // then
        assertThat(failure).isInstanceOf(RecordingException.class);
    }
}
