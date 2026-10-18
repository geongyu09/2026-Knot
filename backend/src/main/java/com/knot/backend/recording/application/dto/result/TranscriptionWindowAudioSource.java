package com.knot.backend.recording.application.dto.result;

public record TranscriptionWindowAudioSource(
        long windowId,
        long recordingId,
        String pipelineVersion,
        String manifestJson,
        String manifestSha256,
        String finalStorageKey,
        String finalVersionId,
        String finalChecksumSha256,
        long finalByteLength
) {
}
