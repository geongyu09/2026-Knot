package com.knot.backend.recording.application.dto.result;

public record PreparedWindowSource(
        String storageKey,
        String versionId,
        String checksumSha256,
        long byteLength,
        long totalFrames
) {
}
