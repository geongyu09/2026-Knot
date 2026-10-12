package com.knot.backend.search.application.dto.result;

import com.knot.backend.search.domain.SearchMessageStatus;

public record SearchAnswerStopResult(
        long answerId,
        SearchMessageStatus status,
        String content
) {
}
