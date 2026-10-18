package com.knot.backend.recording.application;

import java.nio.file.Path;
import java.util.UUID;

public interface RecordingInputPreparationClient {
    Snapshot get(UUID attemptId);
    Snapshot submit(
            UUID attemptId,
            String downloadUrl
    );
    void download(
            UUID attemptId,
            Path destination,
            long byteLength
    );

    record Snapshot(
            UUID attemptId,
            String status,
            String failureCode,
            Result result
    ) {
    }
    record Result(
            int schemaVersion,
            String normalizationVersion,
            long totalFrames,
            long byteLength,
            String checksumSha256
    ) {
    }
}
