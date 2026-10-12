package com.knot.backend.global.exception;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.knot.backend.search.domain.SearchErrorCode;
import com.knot.backend.search.domain.SearchException;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class SearchQuestionExceptionHandlerTest {

    private final SearchQuestionExceptionHandler handler = new SearchQuestionExceptionHandler(
            new GlobalExceptionHandler()
    );

    @Test
    @DisplayName("접수 전 도메인 오류는 SSE Accept와 관계없이 JSON으로 반환한다")
    void handleProjectException_success_beforeCommit() {
        HttpServletResponse response = mock(HttpServletResponse.class);
        SearchException exception = new SearchException(SearchErrorCode.VALIDATION_ERROR);
        org.springframework.http.ResponseEntity<com.knot.backend.global.response.ErrorResponse> result = handler
                .handleProjectException(
                        exception,
                        response
                );
        assertThat(
                result.getStatusCode()
                        .value()
        ).isEqualTo(400);
        assertThat(
                result.getHeaders()
                        .getContentType()
        ).isEqualTo(MediaType.APPLICATION_JSON);
        assertThat(result.getBody()).isNotNull();
    }

    @Test
    @DisplayName("SSE 응답이 시작된 뒤 예외에는 JSON 본문을 다시 쓰지 않는다")
    void handleUnexpectedException_success_afterCommit() {
        HttpServletResponse response = mock(HttpServletResponse.class);
        when(response.isCommitted()).thenReturn(true);
        when(response.getStatus()).thenReturn(200);
        org.springframework.http.ResponseEntity<com.knot.backend.global.response.ErrorResponse> result = handler
                .handleUnexpectedException(
                        new IllegalStateException("transport disconnected"),
                        response
                );
        assertThat(
                result.getStatusCode()
                        .value()
        ).isEqualTo(200);
        assertThat(result.getBody()).isNull();
        assertThat(
                result.getHeaders()
                        .getContentType()
        ).isNull();
    }

    @Test
    @DisplayName("응답 시작 후 권한 회수 예외도 JSON 본문을 추가하지 않는다")
    void handleProjectException_success_afterCommit() {
        HttpServletResponse response = mock(HttpServletResponse.class);
        when(response.isCommitted()).thenReturn(true);
        when(response.getStatus()).thenReturn(200);
        org.springframework.http.ResponseEntity<com.knot.backend.global.response.ErrorResponse> result = handler
                .handleProjectException(
                        new SearchException(SearchErrorCode.SEARCH_ACCESS_DENIED),
                        response
                );
        assertThat(result.getBody()).isNull();
        assertThat(
                result.getStatusCode()
                        .value()
        ).isEqualTo(200);
    }
}
