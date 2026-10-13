package com.knot.ai.transcription.domain;

import com.knot.ai.global.exception.ProjectException;

public final class TranscriptionException extends ProjectException {

    public TranscriptionException(TranscriptionErrorCode errorCode) {
        super(errorCode);
    }
}
