package com.knot.backend.recording.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

@Getter
@Entity
@Table(name = "recording_transcriptions")
public class RecordingTranscription {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "recording_session_id", nullable = false, updatable = false)
    private long recordingSessionId;

    @Column(name = "attempt_id", nullable = false)
    private UUID attemptId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TranscriptionStatus status;

    @Column(name = "failure_code", length = 100)
    private String failureCode;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    protected RecordingTranscription() {}

    private RecordingTranscription(
            long recordingSessionId,
            UUID attemptId,
            Instant startedAt
    ) {
        if (recordingSessionId <= 0 || attemptId == null || startedAt == null) {
            throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_DATA);
        }
        this.recordingSessionId = recordingSessionId;
        start(
                attemptId,
                startedAt
        );
    }

    public static RecordingTranscription processing(
            long recordingSessionId,
            UUID attemptId,
            Instant startedAt
    ) {
        return new RecordingTranscription(
                recordingSessionId,
                attemptId,
                startedAt
        );
    }

    public void validateRetryable() {
        if (status != TranscriptionStatus.FAILED) {
            throw new RecordingException(RecordingErrorCode.TRANSCRIPTION_RETRY_NOT_ALLOWED);
        }
    }

    public void retry(
            UUID nextAttemptId,
            Instant startedAt
    ) {
        validateRetryable();
        if (nextAttemptId == null || nextAttemptId.equals(attemptId) || startedAt == null
                || startedAt.isBefore(this.startedAt)) {
            throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_DATA);
        }
        start(
                nextAttemptId,
                startedAt
        );
    }

    public boolean isProcessing(UUID expectedAttemptId) {
        return status == TranscriptionStatus.PROCESSING && attemptId.equals(expectedAttemptId);
    }

    public void succeed(UUID expectedAttemptId) {
        if (!isProcessing(expectedAttemptId)) {
            return;
        }
        this.status = TranscriptionStatus.SUCCEEDED;
    }

    public void fail(
            UUID expectedAttemptId,
            String failureCode
    ) {
        if (!isProcessing(expectedAttemptId)) {
            return;
        }
        if (failureCode == null || failureCode.isBlank() || failureCode.length() > 100) {
            throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_DATA);
        }
        this.status = TranscriptionStatus.FAILED;
        this.failureCode = failureCode;
    }

    private void start(
            UUID attemptId,
            Instant startedAt
    ) {
        this.attemptId = attemptId;
        this.status = TranscriptionStatus.PROCESSING;
        this.failureCode = null;
        this.startedAt = startedAt;
    }

}
