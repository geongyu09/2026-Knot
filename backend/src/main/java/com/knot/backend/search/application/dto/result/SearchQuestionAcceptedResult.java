package com.knot.backend.search.application.dto.result;

import com.fasterxml.jackson.annotation.JsonIgnore;

public record SearchQuestionAcceptedResult(
        long conversationId,
        long questionMessageId,
        long answerMessageId,
        @JsonIgnore long receiptId
) {
    public SearchQuestionAcceptedResult(
            long conversationId,
            long questionMessageId,
            long answerMessageId
    ) {
        this(
                conversationId,
                questionMessageId,
                answerMessageId,
                0
        );
    }
}
