package com.knot.backend.recording.application.dto.result;

import java.time.Instant;
import java.util.UUID;

public record RecordingTranscriptionExecution(
        long workspaceId,
        long recordingId,
        UUID attemptId,
        String storageKey,
        String contentType,
        long contentLength,
        Instant startedAt
) {
}
