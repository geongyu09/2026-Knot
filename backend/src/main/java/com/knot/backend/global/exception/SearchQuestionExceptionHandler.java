package com.knot.backend.global.exception;

import com.knot.backend.global.response.ErrorResponse;
import com.knot.backend.search.presentation.SearchQuestionController;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice(assignableTypes = SearchQuestionController.class)
@Order(Ordered.HIGHEST_PRECEDENCE)
@RequiredArgsConstructor
public class SearchQuestionExceptionHandler {

    private final GlobalExceptionHandler global;

    @ExceptionHandler(ProjectException.class)
    public ResponseEntity<ErrorResponse> handleProjectException(
            ProjectException exception,
            HttpServletResponse response
    ) {
        if (response.isCommitted()) {
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
            HttpServletResponse response
    ) {
        if (response.isCommitted()) {
            return ResponseEntity.status(response.getStatus())
                    .build();
        }
        return json(global.handleUnexpectedException(exception));
    }

    private ResponseEntity<ErrorResponse> json(ResponseEntity<ErrorResponse> response) {
        return ResponseEntity.status(response.getStatusCode())
                .contentType(MediaType.APPLICATION_JSON)
                .body(response.getBody());
    }
}
