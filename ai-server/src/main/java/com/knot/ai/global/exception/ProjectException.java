package com.knot.ai.global.exception;

import java.io.Serial;
import java.util.Objects;

public abstract class ProjectException extends RuntimeException {
    @Serial
    private static final long serialVersionUID = 1L;

    private final ErrorCode errorCode;

    protected ProjectException(ErrorCode errorCode) {
        super(requireErrorCode(errorCode).getMessage());
        this.errorCode = errorCode;
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }

    private static ErrorCode requireErrorCode(ErrorCode errorCode) {
        return Objects.requireNonNull(
                errorCode,
                "오류 코드는 필수입니다"
        );
    }
}
