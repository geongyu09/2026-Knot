package com.knot.backend.search.application.dto.result;

public record SearchQuestionAcceptedResult(
        long conversationId,
        long questionMessageId,
        long answerMessageId
) {
}
