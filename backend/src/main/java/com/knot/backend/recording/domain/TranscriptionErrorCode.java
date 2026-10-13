package com.knot.backend.recording.domain;

import com.knot.backend.global.exception.ErrorCategory;
import com.knot.backend.global.exception.ErrorCode;
import lombok.Getter;

@Getter
public enum TranscriptionErrorCode implements ErrorCode {
    AI_BUSY(
            ErrorCategory.CONFLICT,
            "AI_BUSY",
            "다른 전사 작업이 실행 중입니다"
    ),
    AI_NOT_READY(
            ErrorCategory.INTERNAL_SERVER_ERROR,
            "AI_NOT_READY",
            "전사 서버가 준비되지 않았습니다"
    ),
    AI_JOB_NOT_FOUND(
            ErrorCategory.NOT_FOUND,
            "AI_JOB_NOT_FOUND",
            "전사 작업을 찾을 수 없습니다"
    ),
    AI_AUTHENTICATION_FAILED(
            ErrorCategory.INTERNAL_SERVER_ERROR,
            "AI_AUTHENTICATION_FAILED",
            "전사 서버 인증에 실패했습니다"
    ),
    AI_TIMEOUT(
            ErrorCategory.INTERNAL_SERVER_ERROR,
            "AI_TIMEOUT",
            "전사 서버 응답 시간이 초과되었습니다"
    ),
    AI_UNAVAILABLE(
            ErrorCategory.INTERNAL_SERVER_ERROR,
            "AI_UNAVAILABLE",
            "전사 서버를 사용할 수 없습니다"
    ),
    AI_INVALID_RESPONSE(
            ErrorCategory.INTERNAL_SERVER_ERROR,
            "AI_INVALID_RESPONSE",
            "전사 서버 응답이 올바르지 않습니다"
    ),
    AI_INTERRUPTED(
            ErrorCategory.INTERNAL_SERVER_ERROR,
            "AI_INTERRUPTED",
            "전사 서버 호출이 중단되었습니다"
    ),
    AI_INVALID_CONFIGURATION(
            ErrorCategory.INTERNAL_SERVER_ERROR,
            "AI_INVALID_CONFIGURATION",
            "전사 서버 설정이 올바르지 않습니다"
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
}
