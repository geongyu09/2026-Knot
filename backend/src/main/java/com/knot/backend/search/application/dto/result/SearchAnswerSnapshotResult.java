package com.knot.backend.search.application.dto.result;

import com.knot.backend.search.domain.SearchMessageStatus;
import com.knot.backend.search.domain.SearchProgressStage;
import java.util.List;
import java.util.UUID;

public record SearchAnswerSnapshotResult(
        long answerId,
        String content,
        SearchMessageStatus status,
        String failureCode,
        UUID executionToken,
        SearchProgressStage stage,
        Integer excludedCount,
        List<SearchEvidenceItemResult> evidences,
        long receiptId
) {
    public SearchAnswerSnapshotResult(
            long answerId,
            String content,
            SearchMessageStatus status,
            String failureCode,
            UUID executionToken,
            SearchProgressStage stage,
            Integer excludedCount,
            List<SearchEvidenceItemResult> evidences
    ) {
        this(
                answerId,
                content,
                status,
                failureCode,
                executionToken,
                stage,
                excludedCount,
                evidences,
                0
        );
    }
}
