package com.knot.ai.preparation.domain;

public record AudioPreparationResult(
        int schemaVersion,
        String normalizationVersion,
        long totalFrames,
        long byteLength,
        String checksumSha256
) {
    public AudioPreparationResult {
        if (schemaVersion != 1 || !"pcm16le-16k-mono-v1".equals(normalizationVersion) || totalFrames <= 0
                || totalFrames > 115200000 || byteLength != 44 + totalFrames * 2 || checksumSha256 == null
                || !checksumSha256.matches("[A-Za-z0-9+/]{43}=")) {
            throw new IllegalArgumentException("INVALID_PREPARATION_RESULT");
        }
    }
}
