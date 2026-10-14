package com.knot.ai.global.exception;

public interface ErrorCode {

    ErrorCategory getCategory();

    String getCode();

    String getMessage();
}
