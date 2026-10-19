package com.knot.ai.transcription.application.command;

import com.knot.ai.transcription.domain.WindowInput;
import java.util.UUID;

public record CreateTranscriptionCommand(
        UUID attemptId,
        String downloadUrl,
        Integer speakerCount,
        WindowInput window
) {
    public CreateTranscriptionCommand(
            UUID attemptId,
            String downloadUrl,
            Integer speakerCount
    ) {
        this(
                attemptId,
                downloadUrl,
                speakerCount,
                null
        );
    }
}
