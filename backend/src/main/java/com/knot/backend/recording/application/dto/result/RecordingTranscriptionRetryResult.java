package com.knot.backend.recording.application.dto.result;

import com.knot.backend.recording.domain.TranscriptionStatus;
import java.util.UUID;

public record RecordingTranscriptionRetryResult(
        long recordingId,
        UUID attemptId,
        TranscriptionStatus status
) {
}
