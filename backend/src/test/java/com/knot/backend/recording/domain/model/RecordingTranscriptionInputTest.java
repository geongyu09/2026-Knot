package com.knot.backend.recording.domain.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RecordingTranscriptionInputTest {
    private static final Instant NOW = Instant.parse("2026-10-18T00:00:00Z");
    private static final Duration LEASE = Duration.ofSeconds(30);

    @Test
    void claim_recoversSameAttemptWithNewEpochAndFixedDeadline() {
        // given
        RecordingTranscriptionInput input = queued();
        UUID first = UUID.randomUUID();
        input.claim(
                first,
                NOW,
                LEASE
        );
        UUID attempt = input.getAttemptId();
        Instant deadline = input.getExecutionDeadline();
        UUID second = UUID.randomUUID();

        // when
        boolean recovered = input.claim(
                second,
                NOW.plusSeconds(30),
                LEASE
        );

        // then
        assertThat(recovered).isTrue();
        assertThat(input.getAttemptId()).isEqualTo(attempt);
        assertThat(input.getClaimEpoch()).isEqualTo(2);
        assertThat(input.getExecutionDeadline()).isEqualTo(deadline);
        assertThat(
                input.owned(
                        attempt,
                        first,
                        1,
                        NOW.plusSeconds(31)
                )
        ).isFalse();
    }

    @Test
    void claim_doesNotStealActiveLease() {
        // given
        RecordingTranscriptionInput input = queued();
        input.claim(
                UUID.randomUUID(),
                NOW,
                LEASE
        );

        // when
        boolean claimed = input.claim(
                UUID.randomUUID(),
                NOW.plusSeconds(29),
                LEASE
        );

        // then
        assertThat(claimed).isFalse();
        assertThat(input.getClaimEpoch()).isEqualTo(1);
    }

    @Test
    void expire_fixedDeadlineBecomesRetryableFailure() {
        // given
        RecordingTranscriptionInput input = queued();
        input.claim(
                UUID.randomUUID(),
                NOW,
                LEASE
        );
        UUID attempt = input.getAttemptId();

        // when
        boolean expired = input.expire(NOW.plus(Duration.ofMinutes(15)));

        // then
        assertThat(expired).isTrue();
        assertThat(input.getStatus()).isEqualTo(InputPreparationStatus.FAILED);
        assertThat(input.getAttemptId()).isEqualTo(attempt);
        assertThat(input.getOwnerToken()).isNull();
    }

    @Test
    void retry_failedPreparationChangesAttemptAndPreservesOriginalObjectVersion() {
        // given
        RecordingTranscriptionInput input = queued();
        input.claim(
                UUID.randomUUID(),
                NOW,
                LEASE
        );
        input.fail("INPUT_PREPARATION_FAILED");
        UUID previous = input.getAttemptId();

        // when
        input.retry(NOW.plusSeconds(10));

        // then
        assertThat(input.getStatus()).isEqualTo(InputPreparationStatus.QUEUED);
        assertThat(input.getAttemptId()).isNotEqualTo(previous);
        assertThat(input.getExecutionDeadline()).isNull();
        assertThat(input.getSourceStorageKey()).isEqualTo("recordings/1/original.webm");
        assertThat(input.getSourceVersionId()).isEqualTo("original-v1");
    }

    @Test
    void ready_freezesExactDerivedObjectMetadata() {
        // given
        RecordingTranscriptionInput input = queued();
        input.claim(
                UUID.randomUUID(),
                NOW,
                LEASE
        );
        StoredAudioChunk stored = stored();
        String key = key(input);

        // when
        input.ready(
                key,
                stored,
                10
        );

        // then
        assertThat(input.getStatus()).isEqualTo(InputPreparationStatus.READY);
        assertThat(input.getStorageVersionId()).isEqualTo("prepared-v1");
        assertThat(input.getTotalFrames()).isEqualTo(10);
        assertThat(input.getOwnerToken()).isNull();
    }

    @Test
    void ready_rejectsContentHashKeyMismatch() {
        // given
        RecordingTranscriptionInput input = queued();
        input.claim(
                UUID.randomUUID(),
                NOW,
                LEASE
        );
        String key = "recordings/1/prepared/" + input.getAttemptId() + "/" + "f".repeat(64) + ".wav";

        // when
        Throwable failure = catchThrowable(
                () -> input.ready(
                        key,
                        stored(),
                        10
                )
        );

        // then
        assertThat(failure).isInstanceOf(com.knot.backend.recording.domain.RecordingException.class);
        assertThat(input.getStatus()).isEqualTo(InputPreparationStatus.PROCESSING);
    }

    @Test
    void cancel_purgesSuccessfulDerivedMetadataAndDisablesRetries() {
        // given
        RecordingTranscriptionInput input = queued();
        input.claim(
                UUID.randomUUID(),
                NOW,
                LEASE
        );
        input.ready(
                key(input),
                stored(),
                10
        );

        // when
        input.cancel();

        // then
        assertThat(input.getStatus()).isEqualTo(InputPreparationStatus.CANCELLED);
        assertThat(input.getStorageKey()).isNull();
        assertThat(input.getStorageVersionId()).isNull();
        assertThat(input.getTotalFrames()).isZero();
        assertThat(
                input.claim(
                        UUID.randomUUID(),
                        NOW,
                        LEASE
                )
        ).isFalse();
    }

    private RecordingTranscriptionInput queued() {
        return RecordingTranscriptionInput.queued(
                1,
                "recordings/1/original.webm",
                "original-v1",
                "audio/webm",
                100,
                NOW
        );
    }

    private StoredAudioChunk stored() {
        return new StoredAudioChunk(
                true,
                64,
                "audio/wav",
                Base64.getEncoder()
                        .encodeToString(new byte[32]),
                "prepared-v1"
        );
    }

    private String key(RecordingTranscriptionInput input) {
        return "recordings/1/prepared/" + input.getAttemptId() + "/" + HexFormat.of()
                .formatHex(new byte[32]) + ".wav";
    }
}
