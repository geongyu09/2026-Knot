package com.knot.backend.recording.application.dto.result;

import java.util.UUID;

public record AiTranscriptionJob(
        UUID attemptId,
        Status status,
        String failureCode,
        AiTranscript result
) {
    public enum Status {
        PROCESSING,
        SUCCEEDED,
        FAILED
    }
}
