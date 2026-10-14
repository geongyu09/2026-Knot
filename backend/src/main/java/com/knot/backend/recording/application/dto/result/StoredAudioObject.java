package com.knot.backend.recording.application.dto.result;

public record StoredAudioObject(
        boolean exists,
        long contentLength,
        String contentType,
        String versionId
) {

    public static StoredAudioObject missing() {
        return new StoredAudioObject(
                false,
                0L,
                null,
                null
        );
    }

    public static StoredAudioObject of(
            long contentLength,
            String contentType,
            String versionId
    ) {
        return new StoredAudioObject(
                true,
                contentLength,
                contentType,
                versionId
        );
    }
}
