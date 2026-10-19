package com.knot.ai.preparation.application;

import com.knot.ai.preparation.domain.AudioPreparationResult;
import java.nio.file.Path;
import java.util.UUID;

public interface AudioPreparationEngine {
    AudioPreparationResult prepare(
            UUID attemptId,
            String downloadUrl
    ) throws Exception;
    Path audio(UUID attemptId);
    void cleanup(UUID attemptId) throws Exception;
    boolean isReady();
}
