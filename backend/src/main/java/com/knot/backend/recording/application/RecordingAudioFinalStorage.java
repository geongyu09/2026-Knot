package com.knot.backend.recording.application;

import com.knot.backend.recording.domain.model.AudioManifestPart;
import com.knot.backend.recording.domain.model.StoredAudioChunk;
import java.io.InputStream;
import java.nio.file.Path;

public interface RecordingAudioFinalStorage {
    InputStream openChunk(AudioManifestPart part);

    default InputStream openFinalRange(
            String storageKey,
            String versionId,
            long firstByte,
            long byteLength
    ) {
        throw new com.knot.backend.recording.domain.RecordingException(
                com.knot.backend.recording.domain.RecordingErrorCode.AUDIO_STORAGE_UNAVAILABLE
        );
    }

    StoredAudioChunk uploadFinal(
            String storageKey,
            Path file,
            long byteLength,
            String checksumSha256
    );

    StoredAudioChunk findStoredFinal(String storageKey);
}
