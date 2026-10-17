package com.knot.backend.recording.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RecordingAudioDeletionTaskTest {
    private static final Instant NOW = Instant.parse("2026-10-09T00:00:00Z");

    @Test
    @DisplayName("현재 시도의 저장소 삭제가 성공하면 삭제 작업을 바로 완료한다")
    void recordSuccess_success_completesImmediately() {
        // given
        RecordingAudioDeletionTask task = request();
        task.claim(
                NOW,
                NOW.plusSeconds(5)
        );

        // when
        task.recordSuccess(
                1,
                NOW.plusSeconds(1)
        );

        // then
        assertThat(task.isSucceeded()).isTrue();
        assertThat(task.getCompletedAt()).isEqualTo(NOW.plusSeconds(1));
        assertThat(task.getExecutionDeadlineAt()).isNull();
    }

    @Test
    @DisplayName("저장소 삭제 실패 뒤 다음 시도가 성공하면 남은 실패 코드를 지우고 완료한다")
    void recordSuccess_success_afterStorageFailure() {
        // given
        RecordingAudioDeletionTask task = request();
        Instant claimedAt = failRepeatedly(
                task,
                1
        );
        task.claim(
                claimedAt,
                claimedAt.plusSeconds(5)
        );

        // when
        task.recordSuccess(
                2,
                claimedAt.plusSeconds(1)
        );

        // then
        assertThat(task.isSucceeded()).isTrue();
        assertThat(task.getLastFailureCode()).isNull();
    }

    @Test
    @DisplayName("중단된 삭제 작업을 회수한 뒤 도착한 이전 시도의 성공은 무시한다")
    void recordSuccess_success_staleAttemptIgnored() {
        // given
        RecordingAudioDeletionTask task = request();
        task.claim(
                NOW,
                NOW.plusSeconds(5)
        );
        task.claim(
                NOW.plusSeconds(5),
                NOW.plusSeconds(10)
        );

        // when
        task.recordSuccess(
                1,
                NOW.plusSeconds(6)
        );

        // then
        assertThat(task.getStatus()).isEqualTo(RecordingAudioDeletionStatus.RUNNING);
    }

    @Test
    @DisplayName("첫 저장소 삭제 실패는 1분 뒤 다시 시도하고 저장소 장애 코드를 남긴다")
    void recordStorageFailure_success_firstRetryAfterOneMinute() {
        // given
        RecordingAudioDeletionTask task = request();
        task.claim(
                NOW,
                NOW.plusSeconds(5)
        );

        // when
        task.recordStorageFailure(
                1,
                NOW.plusSeconds(1)
        );

        // then
        assertThat(task.getStatus()).isEqualTo(RecordingAudioDeletionStatus.PENDING);
        assertThat(task.getNextAttemptAt()).isEqualTo(NOW.plusSeconds(61));
        assertThat(task.getLastFailureCode()).isEqualTo("AUDIO_STORAGE_UNAVAILABLE");
    }

    @Test
    @DisplayName("반복된 저장소 삭제 실패는 재시도 간격을 두 배씩 늘린다")
    void recordStorageFailure_success_doublesRetryInterval() {
        // given
        RecordingAudioDeletionTask task = request();
        Instant claimedAt = failRepeatedly(
                task,
                2
        );
        task.claim(
                claimedAt,
                claimedAt.plusSeconds(5)
        );

        // when
        task.recordStorageFailure(
                3,
                claimedAt.plusSeconds(1)
        );

        // then
        assertThat(task.getNextAttemptAt()).isEqualTo(claimedAt.plusSeconds(1 + 240));
    }

    @Test
    @DisplayName("저장소 삭제 실패의 재시도 간격은 1시간을 넘지 않는다")
    void recordStorageFailure_success_retryIntervalCappedAtOneHour() {
        // given
        RecordingAudioDeletionTask task = request();
        Instant claimedAt = failRepeatedly(
                task,
                7
        );
        task.claim(
                claimedAt,
                claimedAt.plusSeconds(5)
        );

        // when
        task.recordStorageFailure(
                8,
                claimedAt.plusSeconds(1)
        );

        // then
        assertThat(task.getNextAttemptAt()).isEqualTo(claimedAt.plusSeconds(1 + 3600));
    }

    @Test
    @DisplayName("이미 점유한 작업은 준비되기 전에 다시 점유할 수 없다")
    void claim_failure_unready() {
        // given
        RecordingAudioDeletionTask task = request();
        task.claim(
                NOW,
                NOW.plusSeconds(5)
        );

        // when
        Throwable failure = catchThrowable(
                () -> task.claim(
                        NOW,
                        NOW.plusSeconds(5)
                )
        );

        // then
        assertThat(failure).isInstanceOf(RecordingException.class)
                .extracting("errorCode")
                .isEqualTo(RecordingErrorCode.AUDIO_DELETION_CONFLICT);
    }

    @Test
    @DisplayName("업로드 식별자가 없는 삭제 요청은 만들지 않는다")
    void request_failure_invalidUploadId() {
        // when
        Throwable failure = catchThrowable(
                () -> RecordingAudioDeletionTask.request(
                        0,
                        "key",
                        NOW
                )
        );

        // then
        assertThat(failure).isInstanceOf(RecordingException.class);
    }

    private RecordingAudioDeletionTask request() {
        return RecordingAudioDeletionTask.request(
                1,
                "key",
                NOW
        );
    }

    private Instant failRepeatedly(
            RecordingAudioDeletionTask task,
            int failures
    ) {
        Instant claimedAt = NOW;
        for (int attempt = 1; attempt <= failures; attempt++) {
            task.claim(
                    claimedAt,
                    claimedAt.plusSeconds(5)
            );
            task.recordStorageFailure(
                    attempt,
                    claimedAt.plusSeconds(1)
            );
            claimedAt = task.getNextAttemptAt();
        }
        return claimedAt;
    }
}
