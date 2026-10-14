package com.knot.ai.transcription.application.command;

import java.util.UUID;

public record CreateTranscriptionCommand(
        UUID attemptId,
        String downloadUrl,
        Integer speakerCount
) {
}
