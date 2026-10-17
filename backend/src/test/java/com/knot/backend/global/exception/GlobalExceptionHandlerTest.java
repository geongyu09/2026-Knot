package com.knot.backend.global.exception;

import static org.assertj.core.api.Assertions.assertThat;

import com.knot.backend.global.response.ErrorResponse;
import com.knot.backend.workspace.domain.WorkspaceErrorCode;
import com.knot.backend.workspace.domain.WorkspaceException;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @DisplayName("호출 제한 예외는 429와 Retry-After 오류 응답으로 변환한다")
    @Test
    void handleTooManyRequestsException_success() {
        // given
        RateLimitedProjectException exception = new RateLimitedProjectException(47);

        // when
        ResponseEntity<ErrorResponse> response = handler.handleProjectException(exception);

        // then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(
                response.getHeaders()
                        .getFirst(HttpHeaders.RETRY_AFTER)
        ).isEqualTo("47");
        assertThat(response.getBody()).isNotNull();
        assertThat(
                response.getBody()
                        .code()
        ).isEqualTo("WORKSPACE_INVITATION_PREVIEW_RATE_LIMIT_EXCEEDED");
        assertThat(
                response.getBody()
                        .message()
        ).isEqualTo("워크스페이스 초대 코드 조회 요청이 너무 많습니다");
    }

    @Test
    @DisplayName("MVC handler가 없는 예외를 공통 JSON 404로 변환한다")
    void handlePathNotFound_success_noHandler() {
        // given
        NoHandlerFoundException exception = new NoHandlerFoundException(
                "GET",
                "/private-path",
                HttpHeaders.EMPTY
        );

        // when
        ResponseEntity<ErrorResponse> response = handler.handlePathNotFound(exception);

        // then
        assertHttpError(
                response,
                HttpStatus.NOT_FOUND,
                "REQUEST_PATH_NOT_FOUND",
                "요청 경로를 찾을 수 없습니다"
        );
    }

    @Test
    @DisplayName("정적 리소스가 없는 예외를 공통 JSON 404로 변환한다")
    void handlePathNotFound_success_noResource() {
        // given
        NoResourceFoundException exception = new NoResourceFoundException(
                HttpMethod.GET,
                "/private-resource",
                "private-resource"
        );

        // when
        ResponseEntity<ErrorResponse> response = handler.handlePathNotFound(exception);

        // then
        assertHttpError(
                response,
                HttpStatus.NOT_FOUND,
                "REQUEST_PATH_NOT_FOUND",
                "요청 경로를 찾을 수 없습니다"
        );
    }

    @Test
    @DisplayName("메서드 오류는 405와 여러 지원 메서드의 Allow를 보존한다")
    void handleMethodNotSupported_success() {
        // given
        HttpRequestMethodNotSupportedException exception = new HttpRequestMethodNotSupportedException(
                "DELETE",
                List.of(
                        "GET",
                        "POST"
                )
        );

        // when
        ResponseEntity<ErrorResponse> response = handler.handleMethodNotSupported(exception);

        // then
        assertHttpError(
                response,
                HttpStatus.METHOD_NOT_ALLOWED,
                "METHOD_NOT_ALLOWED",
                "지원하지 않는 요청 메서드입니다"
        );
        assertThat(
                response.getHeaders()
                        .getFirst(HttpHeaders.ALLOW)
        ).isEqualTo("GET, POST");
    }

    @Test
    @DisplayName("지원 메서드가 없는 예외도 Allow 없이 405로 처리한다")
    void handleMethodNotSupported_success_emptyMethods() {
        // given
        HttpRequestMethodNotSupportedException exception = new HttpRequestMethodNotSupportedException(
                "POST",
                List.of()
        );

        // when
        ResponseEntity<ErrorResponse> response = handler.handleMethodNotSupported(exception);

        // then
        assertHttpError(
                response,
                HttpStatus.METHOD_NOT_ALLOWED,
                "METHOD_NOT_ALLOWED",
                "지원하지 않는 요청 메서드입니다"
        );
        assertThat(
                response.getHeaders()
                        .getFirst(HttpHeaders.ALLOW)
        ).isNull();
    }

    @Test
    @DisplayName("PATCH 요청의 미디어 오류는 Accept와 Accept-Patch를 함께 보존한다")
    void handleMediaTypeNotSupported_success_patch() {
        // given
        HttpMediaTypeNotSupportedException exception = new HttpMediaTypeNotSupportedException(
                MediaType.TEXT_PLAIN,
                List.of(
                        MediaType.APPLICATION_JSON,
                        MediaType.APPLICATION_XML
                ),
                HttpMethod.PATCH
        );

        // when
        ResponseEntity<ErrorResponse> response = handler.handleMediaTypeNotSupported(exception);

        // then
        assertHttpError(
                response,
                HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                "UNSUPPORTED_MEDIA_TYPE",
                "지원하지 않는 요청 본문 형식입니다"
        );
        assertThat(
                response.getHeaders()
                        .getAccept()
        ).containsExactly(
                MediaType.APPLICATION_JSON,
                MediaType.APPLICATION_XML
        );
        assertThat(
                response.getHeaders()
                        .getAcceptPatch()
        ).containsExactly(
                MediaType.APPLICATION_JSON,
                MediaType.APPLICATION_XML
        );
        assertThat(
                exception.getHeaders()
                        .getContentType()
        ).isNull();
    }

    @Test
    @DisplayName("지원 미디어 목록이 비어 있어도 415 JSON을 반환한다")
    void handleMediaTypeNotSupported_success_emptyMediaTypes() {
        // given
        HttpMediaTypeNotSupportedException exception = new HttpMediaTypeNotSupportedException(
                MediaType.TEXT_PLAIN,
                List.of()
        );

        // when
        ResponseEntity<ErrorResponse> response = handler.handleMediaTypeNotSupported(exception);

        // then
        assertHttpError(
                response,
                HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                "UNSUPPORTED_MEDIA_TYPE",
                "지원하지 않는 요청 본문 형식입니다"
        );
        assertThat(
                response.getHeaders()
                        .getAccept()
        ).isEmpty();
        assertThat(
                response.getHeaders()
                        .getAcceptPatch()
        ).isEmpty();
    }

    @Test
    @DisplayName("기존 도메인 404는 경로 없음과 다른 오류 코드를 유지한다")
    void handleProjectException_success_domainNotFound() {
        // given
        WorkspaceException exception = new WorkspaceException(WorkspaceErrorCode.WORKSPACE_NOT_FOUND);

        // when
        ResponseEntity<ErrorResponse> response = handler.handleProjectException(exception);

        // then
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody()).isEqualTo(new ErrorResponse(WorkspaceErrorCode.WORKSPACE_NOT_FOUND));
    }

    private void assertHttpError(
            ResponseEntity<ErrorResponse> response,
            HttpStatus status,
            String code,
            String message
    ) {
        assertThat(response.getStatusCode()).isEqualTo(status);
        assertThat(
                response.getHeaders()
                        .getContentType()
        ).isEqualTo(MediaType.APPLICATION_JSON);
        assertThat(response.getBody()).isEqualTo(
                new ErrorResponse(
                        code,
                        message,
                        List.of()
                )
        );
    }
}
