package com.knot.backend.global.exception;

public final class LlmException extends ProjectException {

    public LlmException(LlmErrorCode errorCode) {
        super(errorCode);
    }

    public LlmException(
            LlmErrorCode errorCode,
            Throwable cause
    ) {
        super(
                errorCode,
                cause
        );
    }
}
