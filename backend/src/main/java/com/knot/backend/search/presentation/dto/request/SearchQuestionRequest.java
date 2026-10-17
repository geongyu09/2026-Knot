package com.knot.backend.search.presentation.dto.request;

import com.knot.backend.search.application.dto.command.SearchQuestionCommand;
import io.swagger.v3.oas.annotations.media.Schema;
import tools.jackson.databind.annotation.JsonDeserialize;

public record SearchQuestionRequest(
        @JsonDeserialize(using = SearchQuestionStringDeserializer.class) @Schema(description = "공백이 아닌 질문. 최대 2,000 Unicode 코드 포인트", requiredMode = Schema.RequiredMode.REQUIRED) String content,
        @JsonDeserialize(using = SearchQuestionStringDeserializer.class) @Schema(description = "대화 보존 기간 동안 유지되는 중복 방지 UUID", format = "uuid", requiredMode = Schema.RequiredMode.REQUIRED) String requestId
) {
    public SearchQuestionCommand toCommand() {
        return SearchQuestionCommand.of(
                content,
                requestId
        );
    }
}
