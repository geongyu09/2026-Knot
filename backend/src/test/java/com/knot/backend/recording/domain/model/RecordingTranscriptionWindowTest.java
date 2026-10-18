package com.knot.backend.recording.domain.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import com.knot.backend.recording.domain.RecordingException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class RecordingTranscriptionWindowTest {
    private static final Instant NOW = Instant.parse("2026-10-18T01:00:00Z");
    private static final UUID ATTEMPT = UUID.randomUUID();
    private static final UUID OWNER = UUID.randomUUID();
    private static final Duration LEASE = Duration.ofSeconds(10);
    private static final Duration DEADLINE = Duration.ofSeconds(30);

    @Test
    void explicitRetry_failedWindowGetsNewAttemptAndBudgetWhileOldOwnerIsFenced() {
        // given
        RecordingTranscriptionWindow window = create("{}");
        window.claim(
                OWNER,
                NOW,
                LEASE,
                DEADLINE
        );
        long epoch = window.getClaimEpoch();
        window.fail(
                ATTEMPT,
                OWNER,
                epoch,
                NOW.plusSeconds(1),
                "AI_FAILURE"
        );
        UUID next = UUID.randomUUID();
        // when
        boolean reset = window.resetForExplicitRetry(
                next,
                NOW.plusSeconds(2),
                false
        );
        // then
        assertThat(reset).isTrue();
        assertThat(window.getAttemptId()).isEqualTo(next);
        assertThat(window.getExecutionDeadline()).isNull();
        assertThat(window.getFailureCode()).isNull();
        assertThat(
                window.claim(
                        OWNER,
                        NOW.plusSeconds(2),
                        LEASE,
                        DEADLINE
                )
        ).isTrue();
        assertThat(window.getExecutionDeadline()).isEqualTo(NOW.plusSeconds(32));
        assertThat(
                window.succeed(
                        ATTEMPT,
                        OWNER,
                        epoch,
                        NOW.plusSeconds(3),
                        1,
                        "{}"
                )
        ).isFalse();
    }

    @Test
    void explicitRetry_retainsSuccessfulEvidenceUnlessRegenerationIsRequested() {
        // given
        RecordingTranscriptionWindow window = create("{}");
        window.claim(
                OWNER,
                NOW,
                LEASE,
                DEADLINE
        );
        window.succeed(
                ATTEMPT,
                OWNER,
                window.getClaimEpoch(),
                NOW.plusSeconds(1),
                1,
                "{\"tokens\":[]}"
        );
        // when
        boolean reset = window.resetForExplicitRetry(
                UUID.randomUUID(),
                NOW.plusSeconds(2),
                false
        );
        // then
        assertThat(reset).isFalse();
        assertThat(window.getResultJson()).isNotNull();
        assertThat(
                window.resetForExplicitRetry(
                        UUID.randomUUID(),
                        NOW.plusSeconds(2),
                        true
                )
        ).isTrue();
        assertThat(window.getStatus()).isEqualTo(TranscriptionWindowStatus.QUEUED);
        assertThat(window.getResultJson()).isNull();
        assertThat(window.getResultSha256()).isNull();
        assertThat(window.getResultSchemaVersion()).isNull();
    }

    @Test
    void explicitRetry_doesNotResurrectCancelledOrRestartActiveWindow() {
        // given
        RecordingTranscriptionWindow active = create("{}");
        active.claim(
                OWNER,
                NOW,
                LEASE,
                DEADLINE
        );
        RecordingTranscriptionWindow cancelled = create("{}");
        cancelled.cancel();
        // when
        boolean activeReset = active.resetForExplicitRetry(
                UUID.randomUUID(),
                NOW.plusSeconds(1),
                true
        );
        // then
        assertThat(activeReset).isFalse();
        assertThat(
                cancelled.resetForExplicitRetry(
                        UUID.randomUUID(),
                        NOW.plusSeconds(1),
                        true
                )
        ).isFalse();
        assertThat(active.getAttemptId()).isEqualTo(ATTEMPT);
        assertThat(active.getExecutionDeadline()).isEqualTo(NOW.plus(DEADLINE));
    }

    @Test
    @DisplayName("생성한 구간은 매니페스트 실제 UTF-8 내용의 해시와 작업 식별자를 보존한다")
    void queued_success_utf8ManifestHash() throws Exception {
        // given
        String manifest = "{\"음성\":true}";
        String expectedHash = HexFormat.of()
                .formatHex(
                        MessageDigest.getInstance("SHA-256")
                                .digest(manifest.getBytes(StandardCharsets.UTF_8))
                );

        // when
        RecordingTranscriptionWindow window = create(manifest);

        // then
        assertThat(window.getManifestSha256()).isEqualTo(expectedHash);
        assertThat(window.getAttemptId()).isEqualTo(ATTEMPT);
        assertThat(window.getStatus()).isEqualTo(TranscriptionWindowStatus.QUEUED);
        assertThat(window.getNextRunAt()).isEqualTo(NOW);
        assertThat(window.getExecutionDeadline()).isNull();
    }

    @ParameterizedTest
    @CsvSource({"-1,1,0,1", "0,0,0,1", "2,1,0,2", "0,1,-1,1", "0,1,1,1", "0,2,0,1", "0,1,0,115200001"})
    @DisplayName("핵심 구간과 입력 구간의 순서나 최대 길이가 잘못되면 생성하지 않는다")
    void queued_failure_invalidFrameBounds(
            long coreStart,
            long coreEnd,
            long inputStart,
            long inputEnd
    ) {
        // given
        String manifest = "{}";

        // when
        Throwable failure = catchThrowable(
                () -> RecordingTranscriptionWindow.queued(
                        1,
                        "v1",
                        0,
                        coreStart,
                        coreEnd,
                        inputStart,
                        inputEnd,
                        manifest,
                        ATTEMPT,
                        NOW
                )
        );

        // then
        assertThat(failure).isInstanceOf(RecordingException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "한"})
    @DisplayName("비어 있거나 UTF-8 바이트 상한을 넘는 매니페스트는 거절한다")
    void queued_failure_invalidManifest(String text) {
        // given
        String manifest = text.equals("한") ? text.repeat(349_526) : text;

        // when
        Throwable failure = catchThrowable(() -> create(manifest));

        // then
        assertThat(failure).isInstanceOf(RecordingException.class);
    }

    @Test
    @DisplayName("허용하는 최대 프레임과 정확히 1MiB 매니페스트는 생성할 수 있다")
    void queued_success_maximumBounds() {
        // given
        String manifest = "x".repeat(1_048_576);

        // when
        RecordingTranscriptionWindow window = RecordingTranscriptionWindow.queued(
                1,
                "v1",
                0,
                0,
                115_200_000,
                0,
                115_200_000,
                manifest,
                ATTEMPT,
                NOW
        );

        // then
        assertThat(window.getInputEndFrame()).isEqualTo(115_200_000);
        assertThat(window.getManifestJson()).hasSize(1_048_576);
    }

    @Test
    @DisplayName("기존 소유자의 임대가 유효하면 다른 작업자가 선점하지 못한다")
    void claim_failure_activeLease() {
        // given
        RecordingTranscriptionWindow window = claimed();

        // when
        boolean claimed = window.claim(
                UUID.randomUUID(),
                NOW.plusSeconds(9),
                LEASE,
                DEADLINE
        );

        // then
        assertThat(claimed).isFalse();
        assertThat(window.getOwnerToken()).isEqualTo(OWNER);
        assertThat(window.getClaimEpoch()).isEqualTo(1);
    }

    @Test
    @DisplayName("임대 만료 시각에는 같은 시도와 실행 기한을 유지하여 재선점한다")
    void claim_success_expiredLeaseBoundary() {
        // given
        RecordingTranscriptionWindow window = claimed();
        UUID newOwner = UUID.randomUUID();

        // when
        boolean claimed = window.claim(
                newOwner,
                NOW.plusSeconds(10),
                LEASE,
                Duration.ofSeconds(90)
        );

        // then
        assertThat(claimed).isTrue();
        assertThat(window.getOwnerToken()).isEqualTo(newOwner);
        assertThat(window.getClaimEpoch()).isEqualTo(2);
        assertThat(window.getAttemptId()).isEqualTo(ATTEMPT);
        assertThat(window.getExecutionDeadline()).isEqualTo(NOW.plusSeconds(30));
    }

    @ParameterizedTest
    @ValueSource(ints = {30, 31})
    @DisplayName("최초 실행 기한에 도달하면 임대가 만료되어도 재선점하지 않는다")
    void claim_failure_executionDeadlineReached(int seconds) {
        // given
        RecordingTranscriptionWindow window = claimed();

        // when
        boolean claimed = window.claim(
                OWNER,
                NOW.plusSeconds(seconds),
                LEASE,
                DEADLINE
        );

        // then
        assertThat(claimed).isFalse();
        assertThat(window.getClaimEpoch()).isEqualTo(1);
    }

    @Test
    @DisplayName("재시도 예약은 시도 식별자와 최초 실행 기한을 보존한다")
    void defer_success_preservesDeadline() {
        // given
        RecordingTranscriptionWindow window = claimed();

        // when
        boolean deferred = window.defer(
                ATTEMPT,
                OWNER,
                1,
                NOW.plusSeconds(1),
                NOW.plusSeconds(5),
                "AI_BUSY"
        );

        // then
        assertThat(deferred).isTrue();
        assertThat(window.getStatus()).isEqualTo(TranscriptionWindowStatus.QUEUED);
        assertThat(window.getNextRunAt()).isEqualTo(NOW.plusSeconds(5));
        assertThat(window.getAttemptId()).isEqualTo(ATTEMPT);
        assertThat(window.getExecutionDeadline()).isEqualTo(NOW.plusSeconds(30));
        assertThat(window.getOwnerToken()).isNull();
        assertThat(window.getLeaseUntil()).isNull();
    }

    @Test
    @DisplayName("예약한 재시도 시각 이전에는 선점하지 않는다")
    void claim_failure_beforeNextRunAt() {
        // given
        RecordingTranscriptionWindow window = claimed();
        window.defer(
                ATTEMPT,
                OWNER,
                1,
                NOW,
                NOW.plusSeconds(5),
                "AI_BUSY"
        );

        // when
        boolean claimed = window.claim(
                OWNER,
                NOW.plusSeconds(4),
                LEASE,
                DEADLINE
        );

        // then
        assertThat(claimed).isFalse();
        assertThat(window.getStatus()).isEqualTo(TranscriptionWindowStatus.QUEUED);
    }

    @Test
    @DisplayName("재시도 시각에는 실행 기한을 늘리지 않고 선점한다")
    void claim_success_dueRetry() {
        // given
        RecordingTranscriptionWindow window = claimed();
        window.defer(
                ATTEMPT,
                OWNER,
                1,
                NOW,
                NOW.plusSeconds(5),
                "AI_BUSY"
        );

        // when
        boolean claimed = window.claim(
                OWNER,
                NOW.plusSeconds(5),
                LEASE,
                Duration.ofSeconds(90)
        );

        // then
        assertThat(claimed).isTrue();
        assertThat(window.getExecutionDeadline()).isEqualTo(NOW.plusSeconds(30));
        assertThat(window.getClaimEpoch()).isEqualTo(2);
    }

    @ParameterizedTest
    @ValueSource(strings = {"attempt", "owner", "epoch", "lease", "deadline"})
    @DisplayName("시도와 소유자와 세대 또는 유효 시간이 다르면 결과 채택을 거절한다")
    void succeed_failure_staleFence(String mismatch) {
        // given
        RecordingTranscriptionWindow window = claimed();
        UUID attempt = mismatch.equals("attempt") ? UUID.randomUUID() : ATTEMPT;
        UUID owner = mismatch.equals("owner") ? UUID.randomUUID() : OWNER;
        long epoch = mismatch.equals("epoch") ? 0 : 1;
        Instant now = switch (mismatch) {
            case "lease" -> NOW.plusSeconds(10);
            case "deadline" -> NOW.plusSeconds(30);
            default -> NOW;
        };

        // when
        boolean succeeded = window.succeed(
                attempt,
                owner,
                epoch,
                now,
                1,
                "{}"
        );

        // then
        assertThat(succeeded).isFalse();
        assertThat(window.getResultJson()).isNull();
        assertThat(window.getStatus()).isEqualTo(TranscriptionWindowStatus.PROCESSING);
    }

    @Test
    @DisplayName("임대 갱신 시 실행 기한을 넘는 임대를 부여하지 않는다")
    void renew_success_boundedByDeadline() {
        // given
        RecordingTranscriptionWindow window = claimed();

        // when
        boolean renewed = window.renew(
                ATTEMPT,
                OWNER,
                1,
                NOW.plusSeconds(1),
                Duration.ofSeconds(90)
        );

        // then
        assertThat(renewed).isTrue();
        assertThat(window.getLeaseUntil()).isEqualTo(NOW.plusSeconds(30));
    }

    @Test
    @DisplayName("성공한 결과는 해시와 스키마 버전을 저장하고 소유권을 해제한다")
    void succeed_success_persistedPayload() throws Exception {
        // given
        RecordingTranscriptionWindow window = claimed();
        String result = "{\"발화\":[]}";
        String expectedHash = HexFormat.of()
                .formatHex(
                        MessageDigest.getInstance("SHA-256")
                                .digest(result.getBytes(StandardCharsets.UTF_8))
                );

        // when
        boolean succeeded = window.succeed(
                ATTEMPT,
                OWNER,
                1,
                NOW,
                2,
                result
        );

        // then
        assertThat(succeeded).isTrue();
        assertThat(window.getStatus()).isEqualTo(TranscriptionWindowStatus.SUCCEEDED);
        assertThat(window.getResultSchemaVersion()).isEqualTo(2);
        assertThat(window.getResultJson()).isEqualTo(result);
        assertThat(window.getResultSha256()).isEqualTo(expectedHash);
        assertThat(window.getOwnerToken()).isNull();
    }

    @Test
    @DisplayName("이미 성공한 결과는 늦은 작업자의 결과로 바뀌지 않는다")
    void succeed_failure_alreadySucceeded() {
        // given
        RecordingTranscriptionWindow window = claimed();
        window.succeed(
                ATTEMPT,
                OWNER,
                1,
                NOW,
                1,
                "{}"
        );

        // when
        boolean overwritten = window.succeed(
                ATTEMPT,
                OWNER,
                1,
                NOW,
                2,
                "[]"
        );

        // then
        assertThat(overwritten).isFalse();
        assertThat(window.getResultJson()).isEqualTo("{}");
        assertThat(window.getResultSchemaVersion()).isEqualTo(1);
    }

    @Test
    @DisplayName("UTF-8 상한을 넘는 결과는 성공 상태로 채택하지 않는다")
    void succeed_failure_oversizedUtf8Result() {
        // given
        RecordingTranscriptionWindow window = claimed();
        String result = "한".repeat(349_526);

        // when
        Throwable failure = catchThrowable(
                () -> window.succeed(
                        ATTEMPT,
                        OWNER,
                        1,
                        NOW,
                        1,
                        result
                )
        );

        // then
        assertThat(failure).isInstanceOf(RecordingException.class);
        assertThat(window.getStatus()).isEqualTo(TranscriptionWindowStatus.PROCESSING);
        assertThat(window.getResultJson()).isNull();
    }

    @Test
    @DisplayName("실패 전이는 실패 코드만 저장하고 소유권을 해제한다")
    void fail_success_terminalFailure() {
        // given
        RecordingTranscriptionWindow window = claimed();

        // when
        boolean failed = window.fail(
                ATTEMPT,
                OWNER,
                1,
                NOW,
                "AI_FAILED"
        );

        // then
        assertThat(failed).isTrue();
        assertThat(window.getStatus()).isEqualTo(TranscriptionWindowStatus.FAILED);
        assertThat(window.getFailureCode()).isEqualTo("AI_FAILED");
        assertThat(window.getOwnerToken()).isNull();
        assertThat(window.getLeaseUntil()).isNull();
    }

    @Test
    @DisplayName("취소는 이미 저장한 결과 원문과 해시와 스키마 버전을 제거한다")
    void cancel_success_purgesResult() {
        // given
        RecordingTranscriptionWindow window = claimed();
        window.succeed(
                ATTEMPT,
                OWNER,
                1,
                NOW,
                1,
                "{}"
        );

        // when
        window.cancel();

        // then
        assertThat(window.getStatus()).isEqualTo(TranscriptionWindowStatus.CANCELLED);
        assertThat(window.getResultJson()).isNull();
        assertThat(window.getResultSha256()).isNull();
        assertThat(window.getResultSchemaVersion()).isNull();
        assertThat(window.getOwnerToken()).isNull();
        assertThat(window.getLeaseUntil()).isNull();
    }

    @Test
    @DisplayName("취소된 작업에는 늦게 도착한 성공 결과를 채택하지 않는다")
    void succeed_failure_cancelledWindow() {
        // given
        RecordingTranscriptionWindow window = claimed();
        window.cancel();

        // when
        boolean succeeded = window.succeed(
                ATTEMPT,
                OWNER,
                1,
                NOW,
                1,
                "{}"
        );

        // then
        assertThat(succeeded).isFalse();
        assertThat(window.getResultJson()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"renew", "defer", "fail"})
    @DisplayName("재선점된 작업의 옛 소유자는 임대와 예약 및 실패 상태를 변경하지 못한다")
    void mutate_failure_oldOwnerAfterReclaim(String operation) {
        // given
        RecordingTranscriptionWindow window = claimed();
        UUID currentOwner = UUID.randomUUID();
        window.claim(
                currentOwner,
                NOW.plusSeconds(10),
                LEASE,
                DEADLINE
        );

        // when
        boolean mutated = switch (operation) {
            case "renew" -> window.renew(
                    ATTEMPT,
                    OWNER,
                    1,
                    NOW.plusSeconds(11),
                    LEASE
            );
            case "defer" -> window.defer(
                    ATTEMPT,
                    OWNER,
                    1,
                    NOW.plusSeconds(11),
                    NOW.plusSeconds(12),
                    "AI_BUSY"
            );
            default -> window.fail(
                    ATTEMPT,
                    OWNER,
                    1,
                    NOW.plusSeconds(11),
                    "AI_FAILED"
            );
        };

        // then
        assertThat(mutated).isFalse();
        assertThat(window.getStatus()).isEqualTo(TranscriptionWindowStatus.PROCESSING);
        assertThat(window.getOwnerToken()).isEqualTo(currentOwner);
        assertThat(window.getClaimEpoch()).isEqualTo(2);
    }

    @ParameterizedTest
    @ValueSource(strings = {"id", "version", "longVersion", "index", "manifest", "attempt", "time"})
    @DisplayName("식별자와 버전 및 필수값이 잘못되면 작업을 생성하지 않는다")
    void queued_failure_invalidIdentity(String invalid) {
        // given
        long recordingId = invalid.equals("id") ? 0 : 1;
        String version = invalid.equals("version") ? " " : invalid.equals("longVersion") ? "v".repeat(65) : "v1";
        int windowIndex = invalid.equals("index") ? -1 : 0;
        String manifest = invalid.equals("manifest") ? null : "{}";
        UUID attempt = invalid.equals("attempt") ? null : ATTEMPT;
        Instant now = invalid.equals("time") ? null : NOW;

        // when
        Throwable failure = catchThrowable(
                () -> RecordingTranscriptionWindow.queued(
                        recordingId,
                        version,
                        windowIndex,
                        0,
                        1,
                        0,
                        1,
                        manifest,
                        attempt,
                        now
                )
        );

        // then
        assertThat(failure).isInstanceOf(RecordingException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"schema", "emptyResult", "failureCode", "pastRetry", "zeroLease", "zeroTimeout"})
    @DisplayName("유효한 소유자라도 잘못된 결과와 실행 설정으로 상태를 변경하지 못한다")
    void mutate_failure_invalidPayloadOrTime(String invalid) {
        // given
        RecordingTranscriptionWindow window = claimed();
        RecordingTranscriptionWindow queued = create("{}");

        // when
        Throwable failure = catchThrowable(() -> {
            switch (invalid) {
                case "schema" -> window.succeed(
                        ATTEMPT,
                        OWNER,
                        1,
                        NOW,
                        0,
                        "{}"
                );
                case "emptyResult" -> window.succeed(
                        ATTEMPT,
                        OWNER,
                        1,
                        NOW,
                        1,
                        " "
                );
                case "failureCode" -> window.fail(
                        ATTEMPT,
                        OWNER,
                        1,
                        NOW,
                        "x".repeat(101)
                );
                case "pastRetry" -> window.defer(
                        ATTEMPT,
                        OWNER,
                        1,
                        NOW,
                        NOW.minusSeconds(1),
                        "AI_BUSY"
                );
                case "zeroLease" -> queued.claim(
                        OWNER,
                        NOW,
                        Duration.ZERO,
                        DEADLINE
                );
                default -> queued.claim(
                        OWNER,
                        NOW,
                        LEASE,
                        Duration.ZERO
                );
            }
        });

        // then
        assertThat(failure).isInstanceOf(RecordingException.class);
        assertThat(window.getStatus()).isEqualTo(TranscriptionWindowStatus.PROCESSING);
        assertThat(queued.getStatus()).isEqualTo(TranscriptionWindowStatus.QUEUED);
    }

    @ParameterizedTest
    @ValueSource(ints = {30, 31})
    @DisplayName("실행 기한에 도달한 진행 작업은 만료 실패로 종료하고 소유권을 해제한다")
    void expire_success_processingDeadlineReached(int seconds) {
        // given
        RecordingTranscriptionWindow window = claimed();

        // when
        boolean expired = window.expire(NOW.plusSeconds(seconds));

        // then
        assertThat(expired).isTrue();
        assertThat(window.getStatus()).isEqualTo(TranscriptionWindowStatus.FAILED);
        assertThat(window.getFailureCode()).isEqualTo("EXECUTION_DEADLINE_EXCEEDED");
        assertThat(window.getOwnerToken()).isNull();
        assertThat(window.getLeaseUntil()).isNull();
        assertThat(window.getExecutionDeadline()).isEqualTo(NOW.plusSeconds(30));
    }

    @Test
    @DisplayName("최초 실행 기한에 도달한 재시도 대기 작업도 만료 실패로 종료한다")
    void expire_success_queuedRetryDeadlineReached() {
        // given
        RecordingTranscriptionWindow window = claimed();
        window.defer(
                ATTEMPT,
                OWNER,
                1,
                NOW,
                NOW.plusSeconds(40),
                "AI_BUSY"
        );

        // when
        boolean expired = window.expire(NOW.plusSeconds(30));

        // then
        assertThat(expired).isTrue();
        assertThat(window.getStatus()).isEqualTo(TranscriptionWindowStatus.FAILED);
        assertThat(window.getFailureCode()).isEqualTo("EXECUTION_DEADLINE_EXCEEDED");
    }

    @Test
    @DisplayName("실행 기한 바로 전에는 진행 작업을 만료시키지 않는다")
    void expire_failure_beforeExecutionDeadline() {
        // given
        RecordingTranscriptionWindow window = claimed();

        // when
        boolean expired = window.expire(
                NOW.plusSeconds(30)
                        .minusNanos(1)
        );

        // then
        assertThat(expired).isFalse();
        assertThat(window.getStatus()).isEqualTo(TranscriptionWindowStatus.PROCESSING);
        assertThat(window.getOwnerToken()).isEqualTo(OWNER);
    }

    @Test
    @DisplayName("한 번도 선점되지 않아 실행 기한이 없는 작업은 만료시키지 않는다")
    void expire_failure_unclaimedWindow() {
        // given
        RecordingTranscriptionWindow window = create("{}");

        // when
        boolean expired = window.expire(NOW.plusSeconds(30));

        // then
        assertThat(expired).isFalse();
        assertThat(window.getStatus()).isEqualTo(TranscriptionWindowStatus.QUEUED);
    }

    @ParameterizedTest
    @ValueSource(strings = {"succeeded", "failed", "cancelled"})
    @DisplayName("종료된 작업은 기한 이후 만료 처리해도 기존 상태와 결과를 유지한다")
    void expire_failure_terminalWindow(String terminal) {
        // given
        RecordingTranscriptionWindow window = claimed();
        switch (terminal) {
            case "succeeded" -> window.succeed(
                    ATTEMPT,
                    OWNER,
                    1,
                    NOW,
                    1,
                    "{}"
            );
            case "failed" -> window.fail(
                    ATTEMPT,
                    OWNER,
                    1,
                    NOW,
                    "AI_FAILED"
            );
            default -> window.cancel();
        }
        TranscriptionWindowStatus originalStatus = window.getStatus();
        String originalFailure = window.getFailureCode();
        String originalResult = window.getResultJson();

        // when
        boolean expired = window.expire(NOW.plusSeconds(30));

        // then
        assertThat(expired).isFalse();
        assertThat(window.getStatus()).isEqualTo(originalStatus);
        assertThat(window.getFailureCode()).isEqualTo(originalFailure);
        assertThat(window.getResultJson()).isEqualTo(originalResult);
    }

    @Test
    @DisplayName("만료 시각이 없으면 상태를 변경하지 않고 입력 오류로 거절한다")
    void expire_failure_nullTime() {
        // given
        RecordingTranscriptionWindow window = claimed();

        // when
        Throwable failure = catchThrowable(() -> window.expire(null));

        // then
        assertThat(failure).isInstanceOf(RecordingException.class);
        assertThat(window.getStatus()).isEqualTo(TranscriptionWindowStatus.PROCESSING);
    }

    private RecordingTranscriptionWindow create(String manifest) {
        return RecordingTranscriptionWindow.queued(
                1,
                "v1",
                0,
                0,
                480_000,
                0,
                560_000,
                manifest,
                ATTEMPT,
                NOW
        );
    }

    private RecordingTranscriptionWindow claimed() {
        RecordingTranscriptionWindow window = create("{}");
        window.claim(
                OWNER,
                NOW,
                LEASE,
                DEADLINE
        );
        return window;
    }
}
