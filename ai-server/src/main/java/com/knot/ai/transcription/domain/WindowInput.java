package com.knot.ai.transcription.domain;

public record WindowInput(
        String pipelineVersion,
        String inputManifestSha256,
        long inputStartFrame,
        long inputEndFrame
) {
    public WindowInput {
        if (pipelineVersion == null || pipelineVersion.isBlank() || pipelineVersion.length() > 64
                || inputManifestSha256 == null || !inputManifestSha256.matches("[0-9a-f]{64}") || inputStartFrame < 0
                || inputEndFrame <= inputStartFrame || inputEndFrame > 115200000
                || inputEndFrame - inputStartFrame > 960000) {
            throw new TranscriptionException(TranscriptionErrorCode.INVALID_WINDOW);
        }
    }
}
