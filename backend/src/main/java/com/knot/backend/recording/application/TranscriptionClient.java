package com.knot.backend.recording.application;

import com.knot.backend.recording.application.dto.result.AiTranscriptionJob;
import java.util.UUID;

public interface TranscriptionClient {
    AiTranscriptionJob submit(
            UUID attemptId,
            String downloadUrl,
            Integer speakerCount
    );
    AiTranscriptionJob get(UUID attemptId);
}
