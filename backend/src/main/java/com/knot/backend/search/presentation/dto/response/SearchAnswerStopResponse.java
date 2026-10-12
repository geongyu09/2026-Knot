package com.knot.backend.search.presentation.dto.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.knot.backend.search.application.dto.result.SearchAnswerStopResult;
import com.knot.backend.search.domain.SearchMessageStatus;
import io.swagger.v3.oas.annotations.media.Schema;

public record SearchAnswerStopResponse(
        @Schema(requiredMode = REQUIRED) long answerId,
        @Schema(allowableValues = "STOPPED", requiredMode = REQUIRED) SearchMessageStatus status,
        @Schema(description = "중지 커밋 시점까지 저장된 본문. 출력 전 중지는 빈 문자열", requiredMode = REQUIRED) String content
) {

    public static SearchAnswerStopResponse from(SearchAnswerStopResult result) {
        return new SearchAnswerStopResponse(
                result.answerId(),
                result.status(),
                result.content()
        );
    }
}
