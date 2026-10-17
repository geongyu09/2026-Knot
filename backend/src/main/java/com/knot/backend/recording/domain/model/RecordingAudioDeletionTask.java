package com.knot.backend.recording.domain.model;

import com.knot.backend.recording.domain.RecordingErrorCode;
import com.knot.backend.recording.domain.RecordingException;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "recording_audio_deletion_tasks")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RecordingAudioDeletionTask {
    private static final long FIRST_RETRY_SECONDS = 60L;
    private static final long MAX_RETRY_SECONDS = 3600L;
    private static final int MAX_BACKOFF_SHIFT = 6;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "upload_id", nullable = false, unique = true, updatable = false)
    private long uploadId;

    @Column(name = "storage_key", nullable = false, updatable = false)
    private String storageKey;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RecordingAudioDeletionStatus status;

    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt;

    @Column(name = "confirmation_after", nullable = false)
    private Instant confirmationAfter;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "next_attempt_at")
    private Instant nextAttemptAt;

    @Column(name = "execution_deadline_at")
    private Instant executionDeadlineAt;

    @Column(name = "last_failure_code", length = 50)
    private String lastFailureCode;

    @Column(name = "completed_at")
    private Instant completedAt;

    private RecordingAudioDeletionTask(
            long uploadId,
            String storageKey,
            Instant now,
            Instant confirmationAfter
    ) {
        validateUploadId(uploadId);
        validateStorageKey(storageKey);
        validateConfirmationTime(
                now,
                confirmationAfter
        );
        this.uploadId = uploadId;
        this.storageKey = storageKey;
        this.requestedAt = now;
        this.confirmationAfter = confirmationAfter;
        this.status = RecordingAudioDeletionStatus.PENDING;
        this.nextAttemptAt = now;
    }

    public static RecordingAudioDeletionTask request(
            long uploadId,
            String storageKey,
            Instant now,
            Instant confirmationAfter
    ) {
        return new RecordingAudioDeletionTask(
                uploadId,
                storageKey,
                now,
                confirmationAfter
        );
    }

    public boolean isReadyAt(Instant now) {
        validateTime(now);
        if (status == RecordingAudioDeletionStatus.PENDING) {
            return !now.isBefore(nextAttemptAt);
        }
        if (status == RecordingAudioDeletionStatus.RUNNING) {
            return !now.isBefore(executionDeadlineAt);
        }
        return false;
    }

    public void claim(
            Instant now,
            Instant deadline
    ) {
        validateTime(now);
        if (deadline == null || !deadline.isAfter(now)) {
            throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_TIME);
        }
        if (!isReadyAt(now)) {
            throw new RecordingException(RecordingErrorCode.AUDIO_DELETION_CONFLICT);
        }
        status = RecordingAudioDeletionStatus.RUNNING;
        attemptCount++;
        nextAttemptAt = null;
        executionDeadlineAt = deadline;
    }

    public void recordSuccess(
            int attempt,
            Instant now
    ) {
        validateTime(now);
        if (!isCurrentAttempt(
                attempt,
                now
        )) {
            return;
        }
        executionDeadlineAt = null;
        lastFailureCode = null;
        if (now.isBefore(confirmationAfter)) {
            status = RecordingAudioDeletionStatus.PENDING;
            nextAttemptAt = confirmationAfter;
            return;
        }
        status = RecordingAudioDeletionStatus.SUCCEEDED;
        completedAt = now;
    }

    public void recordStorageFailure(
            int attempt,
            Instant now
    ) {
        validateTime(now);
        if (!isCurrentAttempt(
                attempt,
                now
        )) {
            return;
        }
        status = RecordingAudioDeletionStatus.PENDING;
        nextAttemptAt = now.plus(retryBackoff(attempt));
        executionDeadlineAt = null;
        lastFailureCode = RecordingErrorCode.AUDIO_STORAGE_UNAVAILABLE.getCode();
    }

    public boolean isSucceeded() {
        return status == RecordingAudioDeletionStatus.SUCCEEDED;
    }

    private boolean isCurrentAttempt(
            int attempt,
            Instant now
    ) {
        return status == RecordingAudioDeletionStatus.RUNNING && attemptCount == attempt
                && now.isBefore(executionDeadlineAt);
    }

    private Duration retryBackoff(int attempt) {
        int shift = Math.min(
                Math.max(
                        attempt - 1,
                        0
                ),
                MAX_BACKOFF_SHIFT
        );
        return Duration.ofSeconds(
                Math.min(
                        MAX_RETRY_SECONDS,
                        FIRST_RETRY_SECONDS << shift
                )
        );
    }

    private void validateTime(Instant now) {
        if (now == null || now.isBefore(requestedAt)) {
            throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_TIME);
        }
    }

    private void validateUploadId(long uploadId) {
        if (uploadId <= 0) {
            throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_DATA);
        }
    }

    private void validateStorageKey(String storageKey) {
        if (storageKey == null || storageKey.isBlank()) {
            throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_DATA);
        }
    }

    private void validateConfirmationTime(
            Instant now,
            Instant confirmationAfter
    ) {
        if (now == null || confirmationAfter == null || confirmationAfter.isBefore(now)) {
            throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_TIME);
        }
    }
}
