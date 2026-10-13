package com.knot.backend.recording.domain;

import com.knot.backend.global.exception.ProjectException;

public final class TranscriptionException extends ProjectException {
    public TranscriptionException(TranscriptionErrorCode errorCode) {
        super(errorCode);
    }
    public TranscriptionException(
            TranscriptionErrorCode errorCode,
            Throwable cause
    ) {
        super(
                errorCode,
                cause
        );
    }
}
