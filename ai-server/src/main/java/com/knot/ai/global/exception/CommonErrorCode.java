package com.knot.ai.global.exception;

public enum CommonErrorCode implements ErrorCode {
    VALIDATION_ERROR(
            ErrorCategory.INVALID_INPUT,
            "요청 값이 올바르지 않습니다"
    ),
    INVALID_REQUEST_BODY(
            ErrorCategory.INVALID_INPUT,
            "요청 형식이 올바르지 않습니다"
    ),
    METHOD_NOT_ALLOWED(
            ErrorCategory.INVALID_INPUT,
            "허용하지 않는 요청 방식입니다"
    ),
    RESOURCE_NOT_FOUND(
            ErrorCategory.NOT_FOUND,
            "요청 경로를 찾을 수 없습니다"
    ),
    INTERNAL_ERROR(
            ErrorCategory.INTERNAL_SERVER_ERROR,
            "요청을 처리할 수 없습니다"
    );

    private final ErrorCategory category;
    private final String message;

    CommonErrorCode(
            ErrorCategory category,
            String message
    ) {
        this.category = category;
        this.message = message;
    }

    @Override
    public ErrorCategory getCategory() {
        return category;
    }

    @Override
    public String getCode() {
        return name();
    }

    @Override
    public String getMessage() {
        return message;
    }
}
