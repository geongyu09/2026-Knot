package com.knot.backend.search.domain;

import com.knot.backend.global.exception.ErrorCategory;
import com.knot.backend.global.exception.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum SearchErrorCode implements ErrorCode {
    VALIDATION_ERROR(
            ErrorCategory.INVALID_INPUT,
            "VALIDATION_ERROR",
            "질문 또는 requestId가 올바르지 않습니다"
    ),
    REQUEST_ID_CONFLICT(
            ErrorCategory.CONFLICT,
            "REQUEST_ID_CONFLICT",
            "다른 질문에 사용한 requestId입니다"
    ),
    ANSWER_GENERATION_UNAVAILABLE(
            ErrorCategory.INTERNAL_SERVER_ERROR,
            "ANSWER_GENERATION_UNAVAILABLE",
            "답변 생성이 준비되지 않았습니다"
    ),
    INVALID_PARAMETER(
            ErrorCategory.INVALID_INPUT,
            "INVALID_PARAMETER",
            "요청 값이 올바르지 않습니다"
    ),
    SEARCH_ACCESS_DENIED(
            ErrorCategory.FORBIDDEN,
            "SEARCH_ACCESS_DENIED",
            "탐색 대화에 접근할 수 없습니다"
    ),
    ANSWER_NOT_FOUND(
            ErrorCategory.NOT_FOUND,
            "ANSWER_NOT_FOUND",
            "탐색 답변을 찾을 수 없습니다"
    ),
    ANSWER_NOT_RUNNING(
            ErrorCategory.CONFLICT,
            "ANSWER_NOT_RUNNING",
            "답변이 생성 중이 아닙니다"
    ),
    CONVERSATION_NOT_FOUND(
            ErrorCategory.NOT_FOUND,
            "CONVERSATION_NOT_FOUND",
            "탐색 대화를 찾을 수 없습니다"
    );

    private final ErrorCategory category;
    private final String code;
    private final String message;
}
