package com.knot.ai.transcription.domain;

import com.knot.ai.global.exception.ErrorCategory;
import com.knot.ai.global.exception.ErrorCode;

public enum TranscriptionErrorCode implements ErrorCode {
    INVALID_WINDOW(
            ErrorCategory.INVALID_INPUT,
            "구간 전사 입력이 올바르지 않습니다"
    ),
    ATTEMPT_CONFLICT(
            ErrorCategory.CONFLICT,
            "동일 요청의 전사 입력이 변경되었습니다"
    ),
    BUSY(
            ErrorCategory.CONFLICT,
            "다른 전사 작업이 실행 중입니다"
    ),
    NOT_READY(
            ErrorCategory.SERVICE_UNAVAILABLE,
            "전사 서버가 준비되지 않았습니다"
    ),
    JOB_NOT_FOUND(
            ErrorCategory.NOT_FOUND,
            "전사 작업을 찾을 수 없습니다"
    ),
    EXECUTOR_REJECTED(
            ErrorCategory.INTERNAL_SERVER_ERROR,
            "전사 작업을 처리할 수 없습니다"
    ),
    INFERENCE_FAILED(
            ErrorCategory.INTERNAL_SERVER_ERROR,
            "전사 작업을 처리할 수 없습니다"
    ),
    CANCELED(
            ErrorCategory.CONFLICT,
            "전사 작업이 중단되었습니다"
    ),
    INVALID_RESULT(
            ErrorCategory.INTERNAL_SERVER_ERROR,
            "전사 결과가 올바르지 않습니다"
    ),
    AUDIO_DURATION_EXCEEDED(
            ErrorCategory.INVALID_INPUT,
            "녹음 길이는 2시간 이하여야 합니다"
    ),
    INVALID_AUDIO_FORMAT(
            ErrorCategory.INVALID_INPUT,
            "전사 작업을 처리할 수 없습니다"
    ),
    INVALID_PROFILE(
            ErrorCategory.SERVICE_UNAVAILABLE,
            "전사 작업을 처리할 수 없습니다"
    ),
    MISSING_RUNTIME(
            ErrorCategory.SERVICE_UNAVAILABLE,
            "전사 작업을 처리할 수 없습니다"
    ),
    PROCESS_CLEANUP_FAILED(
            ErrorCategory.SERVICE_UNAVAILABLE,
            "전사 작업을 처리할 수 없습니다"
    ),
    UNOWNED_WORK_DIRECTORY(
            ErrorCategory.SERVICE_UNAVAILABLE,
            "전사 작업을 처리할 수 없습니다"
    ),
    DECODE_TIMEOUT(
            ErrorCategory.GATEWAY_TIMEOUT,
            "전사 작업을 처리할 수 없습니다"
    ),
    INFERENCE_TIMEOUT(
            ErrorCategory.GATEWAY_TIMEOUT,
            "전사 작업을 처리할 수 없습니다"
    ),
    DECODE_FAILED(
            ErrorCategory.INTERNAL_SERVER_ERROR,
            "전사 작업을 처리할 수 없습니다"
    ),
    AUDIO_TOO_LARGE(
            ErrorCategory.INVALID_INPUT,
            "오디오 크기가 허용 범위를 초과했습니다"
    ),
    DOWNLOAD_FAILED(
            ErrorCategory.BAD_GATEWAY,
            "오디오를 내려받을 수 없습니다"
    ),
    DOWNLOAD_TIMEOUT(
            ErrorCategory.GATEWAY_TIMEOUT,
            "오디오 다운로드 시간이 초과되었습니다"
    ),
    INCOMPLETE_DOWNLOAD(
            ErrorCategory.BAD_GATEWAY,
            "오디오 다운로드가 완료되지 않았습니다"
    ),
    INVALID_AUDIO_METADATA(
            ErrorCategory.INVALID_INPUT,
            "전사 작업을 처리할 수 없습니다"
    ),
    INVALID_DOWNLOAD_URL(
            ErrorCategory.INVALID_INPUT,
            "오디오 다운로드 주소가 올바르지 않습니다"
    ),
    STT_FAILED(
            ErrorCategory.INTERNAL_SERVER_ERROR,
            "전사 작업을 처리할 수 없습니다"
    ),
    DIARIZATION_FAILED(
            ErrorCategory.INTERNAL_SERVER_ERROR,
            "전사 작업을 처리할 수 없습니다"
    ),
    DIARIZATION_EMPTY(
            ErrorCategory.INTERNAL_SERVER_ERROR,
            "전사 작업을 처리할 수 없습니다"
    ),
    OUTPUT_LIMIT(
            ErrorCategory.INTERNAL_SERVER_ERROR,
            "전사 작업을 처리할 수 없습니다"
    ),
    INVALID_MANIFEST(
            ErrorCategory.INTERNAL_SERVER_ERROR,
            "전사 작업을 처리할 수 없습니다"
    ),
    INVALID_ARGUMENTS(
            ErrorCategory.INTERNAL_SERVER_ERROR,
            "전사 작업을 처리할 수 없습니다"
    ),
    RUNNER_FAILED(
            ErrorCategory.INTERNAL_SERVER_ERROR,
            "전사 작업을 처리할 수 없습니다"
    );

    private final ErrorCategory category;
    private final String message;

    TranscriptionErrorCode(
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
