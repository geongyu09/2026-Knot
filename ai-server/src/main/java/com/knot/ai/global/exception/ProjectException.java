package com.knot.ai.global.exception;

import java.io.Serial;
import java.util.Objects;

public abstract class ProjectException extends RuntimeException {
    @Serial
    private static final long serialVersionUID = 1L;

    private final ErrorCode errorCode;

    protected ProjectException(ErrorCode errorCode) {
        this(
                errorCode,
                null
        );
    }

    protected ProjectException(
            ErrorCode errorCode,
            Throwable cause
    ) {
        super(
                requireErrorCode(errorCode).getMessage(),
                cause
        );
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
