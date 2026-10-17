package com.knot.backend.global.exception;

import com.knot.backend.global.response.ErrorResponse;
import com.knot.backend.global.logging.ServerErrorLogger;
import lombok.extern.slf4j.Slf4j;
import com.knot.backend.search.presentation.SearchQuestionController;
import com.knot.backend.search.presentation.SearchAnswerEventsController;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice(assignableTypes = {SearchQuestionController.class, SearchAnswerEventsController.class})
@Order(Ordered.HIGHEST_PRECEDENCE)
@RequiredArgsConstructor
@Slf4j
public class SearchQuestionExceptionHandler {

    private final GlobalExceptionHandler global;

    @ExceptionHandler(ProjectException.class)
    public ResponseEntity<ErrorResponse> handleProjectException(
            ProjectException exception,
            HttpServletResponse response,
            HttpServletRequest request
    ) {
        if (response.isCommitted()) {
            ServerErrorLogger.record(
                    log,
                    "SSE committed failure",
                    exception
            );
            completeAsyncRequest(request);
            return ResponseEntity.status(response.getStatus())
                    .build();
        }
        return json(global.handleProjectException(exception));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleUnreadableMessage(HttpMessageNotReadableException exception) {
        return json(global.handleUnreadableMessage(exception));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResponse> handleTypeMismatch(MethodArgumentTypeMismatchException exception) {
        return json(global.handleTypeMismatch(exception));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpectedException(
            Exception exception,
            HttpServletResponse response,
            HttpServletRequest request
    ) {
        if (response.isCommitted()) {
            ServerErrorLogger.record(
                    log,
                    "SSE committed failure",
                    exception
            );
            completeAsyncRequest(request);
            return ResponseEntity.status(response.getStatus())
                    .build();
        }
        return json(global.handleUnexpectedException(exception));
    }

    private void completeAsyncRequest(HttpServletRequest request) {
        if (!request.isAsyncStarted()) {
            return;
        }
        request.getAsyncContext()
                .complete();
    }

    private ResponseEntity<ErrorResponse> json(ResponseEntity<ErrorResponse> response) {
        return ResponseEntity.status(response.getStatusCode())
                .contentType(MediaType.APPLICATION_JSON)
                .body(response.getBody());
    }
}
