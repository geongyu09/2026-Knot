package com.knot.ai.global;

import com.knot.ai.global.exception.CommonErrorCode;
import com.knot.ai.global.exception.ErrorCode;
import com.knot.ai.global.exception.ProjectException;
import com.knot.ai.global.response.ErrorResponse.FieldError;
import com.knot.ai.global.response.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.HandlerMapping;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger LOGGER = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ProjectException.class)
    public ResponseEntity<ErrorResponse> handleProject(ProjectException exception) {
        return respond(
                status(exception.getErrorCode()),
                exception.getErrorCode()
                        .getCode(),
                exception.getErrorCode()
                        .getMessage()
        );
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException exception) {
        List<FieldError> fieldErrors = exception.getBindingResult()
                .getFieldErrors()
                .stream()
                .map(
                        error -> new FieldError(
                                error.getField(),
                                error.getDefaultMessage()
                        )
                )
                .toList();
        return ResponseEntity.badRequest()
                .body(
                        new ErrorResponse(
                                CommonErrorCode.VALIDATION_ERROR.getCode(),
                                CommonErrorCode.VALIDATION_ERROR.getMessage(),
                                fieldErrors
                        )
                );
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<ErrorResponse> handleFormat(Exception exception) {
        return respond(
                400,
                CommonErrorCode.INVALID_REQUEST_BODY.getCode(),
                CommonErrorCode.INVALID_REQUEST_BODY.getMessage()
        );
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ErrorResponse> handleMethod(HttpRequestMethodNotSupportedException exception) {
        return respond(
                405,
                CommonErrorCode.METHOD_NOT_ALLOWED.getCode(),
                CommonErrorCode.METHOD_NOT_ALLOWED.getMessage()
        );
    }

    @ExceptionHandler({NoHandlerFoundException.class, NoResourceFoundException.class})
    public ResponseEntity<ErrorResponse> handleMissingResource(Exception exception) {
        return respond(
                404,
                CommonErrorCode.RESOURCE_NOT_FOUND.getCode(),
                CommonErrorCode.RESOURCE_NOT_FOUND.getMessage()
        );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(
            Exception exception,
            HttpServletRequest request
    ) {
        LOGGER.error(
                "예상하지 못한 요청 처리 실패 attemptId={} code={} exception={} cause={} location={}",
                attemptId(request),
                CommonErrorCode.INTERNAL_ERROR.getCode(),
                exception.getClass()
                        .getName(),
                exception.getCause() == null
                        ? "없음"
                        : exception.getCause()
                                .getClass()
                                .getName(),
                exception.getStackTrace().length == 0 ? "없음" : exception.getStackTrace()[0]
        );
        return respond(
                500,
                CommonErrorCode.INTERNAL_ERROR.getCode(),
                CommonErrorCode.INTERNAL_ERROR.getMessage()
        );
    }

    private UUID attemptId(HttpServletRequest request) {
        Object variables = request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        if (variables instanceof Map<?, ?> values && values.get("attemptId") instanceof String id) {
            try {
                return UUID.fromString(id);
            } catch (IllegalArgumentException ignored) {
                return null;
            }
        }
        return null;
    }

    private int status(ErrorCode errorCode) {
        return switch (errorCode.getCategory()) {
            case INVALID_INPUT -> 400;
            case UNAUTHORIZED -> 401;
            case FORBIDDEN -> 403;
            case NOT_FOUND -> 404;
            case CONFLICT -> 409;
            case TOO_MANY_REQUESTS -> 429;
            case INTERNAL_SERVER_ERROR -> 500;
            case BAD_GATEWAY -> 502;
            case SERVICE_UNAVAILABLE -> 503;
            case GATEWAY_TIMEOUT -> 504;
        };
    }

    private ResponseEntity<ErrorResponse> respond(
            int status,
            String code,
            String message
    ) {
        return ResponseEntity.status(status)
                .body(
                        new ErrorResponse(
                                code,
                                message,
                                List.of()
                        )
                );
    }
}
