package com.knot.backend.recording.application;

import com.knot.backend.recording.application.dto.result.AiTranscriptionJob;
import java.util.UUID;

public interface TranscriptionClient {
    default AiTranscriptionJob submit(
            UUID attemptId,
            String downloadUrl
    ) {
        return submit(
                attemptId,
                downloadUrl,
                null
        );
    }

    AiTranscriptionJob submit(
            UUID attemptId,
            String downloadUrl,
            Integer speakerCount
    );
    AiTranscriptionJob get(UUID attemptId);

    default AiTranscriptionJob submitWindow(
            UUID attemptId,
            String downloadUrl,
            com.knot.backend.recording.application.dto.command.AiWindowInput window
    ) {
        throw new UnsupportedOperationException("구간 전사를 지원하지 않는 클라이언트입니다.");
    }
}
