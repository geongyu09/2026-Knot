package com.knot.backend.document.application.dto.result;

import com.knot.backend.document.domain.DocumentGenerationProcessingStatus;
import java.util.List;

public record DocumentGenerationSummaryResult(
        DocumentGenerationProcessingStatus status,
        int succeededCount,
        List<Long> failedJobIds
) {
}
