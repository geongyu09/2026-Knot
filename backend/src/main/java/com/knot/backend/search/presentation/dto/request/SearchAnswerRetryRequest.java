package com.knot.backend.search.presentation.dto.request;

import com.knot.backend.search.application.dto.command.SearchQuestionCommand;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;
import tools.jackson.databind.annotation.JsonDeserialize;

public record SearchAnswerRetryRequest(
        @JsonDeserialize(using = SearchQuestionStringDeserializer.class) @Schema(description = "재시도 요청의 중복 방지 UUID", format = "uuid", requiredMode = Schema.RequiredMode.REQUIRED) String requestId
) {
    public UUID toRequestId() {
        return SearchQuestionCommand.parseRequestId(requestId);
    }
}
