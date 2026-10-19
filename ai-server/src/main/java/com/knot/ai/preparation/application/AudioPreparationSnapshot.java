package com.knot.ai.preparation.application;

import com.knot.ai.preparation.domain.AudioPreparationResult;
import java.util.UUID;

public record AudioPreparationSnapshot(
        UUID attemptId,
        Status status,
        String failureCode,
        AudioPreparationResult result
) {
    public enum Status {
        PROCESSING,
        SUCCEEDED,
        FAILED
    }
}
