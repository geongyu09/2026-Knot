package com.knot.ai.transcription.application;

import com.knot.ai.transcription.application.command.CreateTranscriptionCommand;
import com.knot.ai.transcription.domain.TranscriptResult;
import java.util.UUID;

public interface TranscriptionEngine {
    boolean isReady();
    TranscriptResult transcribe(CreateTranscriptionCommand request) throws Exception;
    void cleanup(UUID attemptId) throws Exception;
}
