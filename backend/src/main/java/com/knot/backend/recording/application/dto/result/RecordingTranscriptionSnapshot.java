package com.knot.backend.recording.application.dto.result;

import com.knot.backend.recording.domain.model.TranscriptionStatus;
import java.util.UUID;

public record RecordingTranscriptionSnapshot(
        UUID attemptId,
        TranscriptionStatus status,
        String failureCode
) {
}
