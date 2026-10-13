package com.knot.ai.transcription.domain;

import com.knot.ai.global.exception.ErrorCategory;
import com.knot.ai.global.exception.ErrorCode;

public enum TranscriptionErrorCode implements ErrorCode {
    INVALID_RESULT(
            ErrorCategory.INTERNAL_SERVER_ERROR,
            "INVALID_RESULT",
            "전사 결과가 올바르지 않습니다"
    );

    private final ErrorCategory category;
    private final String code;
    private final String message;

    TranscriptionErrorCode(
            ErrorCategory category,
            String code,
            String message
    ) {
        this.category = category;
        this.code = code;
        this.message = message;
    }

    @Override
    public ErrorCategory getCategory() {
        return category;
    }

    @Override
    public String getCode() {
        return code;
    }

    @Override
    public String getMessage() {
        return message;
    }
}
