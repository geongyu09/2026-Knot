package com.knot.backend.global.exception;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import com.knot.backend.auth.domain.AuthErrorCode;
import com.knot.backend.auth.domain.AuthException;
import com.knot.backend.search.domain.SearchErrorCode;
import com.knot.backend.search.domain.SearchException;
import com.knot.backend.testsupport.LogCapture;
import com.knot.backend.workspace.domain.WorkspaceErrorCode;
import com.knot.backend.workspace.domain.WorkspaceException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.task.TaskRejectedException;

class GlobalExceptionLoggingTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    @DisplayName("예상 밖 오류는 기존 500과 민감값 없는 원인 로그 한 건을 남긴다")
    void handleUnexpectedException_success_safeError() {
        // given
        RuntimeException exception = new RuntimeException(
                "private-sql",
                new IllegalStateException("private-token")
        );
        exception.addSuppressed(new IllegalArgumentException("private-cookie"));
        try (LogCapture logs = new LogCapture(GlobalExceptionHandler.class)) {
            // when
            assertThat(
                    handler.handleUnexpectedException(exception)
                            .getStatusCode()
                            .value()
            ).isEqualTo(500);
            // then
            assertThat(logs.events()).hasSize(1);
            assertThat(
                    logs.events()
                            .getFirst()
                            .getLevel()
            ).isEqualTo(Level.ERROR);
            assertThat(
                    logs.events()
                            .getFirst()
                            .getFormattedMessage()
            ).contains(
                    "RuntimeException",
                    "IllegalStateException",
                    "suppressed",
                    "GlobalExceptionLoggingTest.java"
            )
                    .doesNotContain(
                            "private-sql",
                            "private-token",
                            "private-cookie"
                    );
            assertThat(
                    logs.events()
                            .getFirst()
                            .getThrowableProxy()
            ).isNull();
        }
    }

    @Test
    @DisplayName("일반 도메인 404는 장애 로그를 남기지 않는다")
    void handleProjectException_success_expectedNotFound() {
        try (LogCapture logs = new LogCapture(GlobalExceptionHandler.class)) {
            assertThat(
                    handler.handleProjectException(new WorkspaceException(WorkspaceErrorCode.WORKSPACE_NOT_FOUND))
                            .getStatusCode()
                            .value()
            ).isEqualTo(404);
            assertThat(logs.events()).isEmpty();
        }
    }

    @Test
    @DisplayName("401로 포장된 내부 오류도 공개 응답을 유지하며 원인을 기록한다")
    void handleProjectException_success_wrappedInternalFailure() {
        AuthException exception = new AuthException(
                AuthErrorCode.UNAUTHENTICATED,
                new AuthException(
                        AuthErrorCode.AUTHENTICATION_INTERNAL_ERROR,
                        new IllegalStateException("private")
                )
        );
        try (LogCapture logs = new LogCapture(GlobalExceptionHandler.class)) {
            assertThat(
                    handler.handleProjectException(exception)
                            .getStatusCode()
                            .value()
            ).isEqualTo(401);
            assertThat(logs.events()).singleElement()
                    .satisfies(event -> {
                        assertThat(event.getLevel()).isEqualTo(Level.ERROR);
                        assertThat(event.getThrowableProxy()).isNull();
                    });
        }
    }

    @Test
    @DisplayName("같은 생성 불가 오류도 용량 부족은 DEBUG로 처리한다")
    void handleProjectException_success_capacityIsNotServerFailure() {
        SearchException exception = new SearchException(
                SearchErrorCode.ANSWER_GENERATION_UNAVAILABLE,
                new TaskRejectedException("private-capacity")
        );
        try (LogCapture logs = new LogCapture(GlobalExceptionHandler.class)) {
            assertThat(
                    handler.handleProjectException(exception)
                            .getStatusCode()
                            .value()
            ).isEqualTo(500);
            assertThat(logs.events()).singleElement()
                    .satisfies(event -> assertThat(event.getLevel()).isEqualTo(Level.DEBUG));
        }
    }
}
