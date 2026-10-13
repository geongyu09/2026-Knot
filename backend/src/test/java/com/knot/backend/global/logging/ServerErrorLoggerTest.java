package com.knot.backend.global.logging;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import com.knot.backend.auth.domain.AuthErrorCode;
import com.knot.backend.auth.domain.AuthException;
import com.knot.backend.global.exception.LlmErrorCode;
import com.knot.backend.global.exception.LlmException;
import com.knot.backend.search.domain.SearchToolException;
import com.knot.backend.testsupport.LogCapture;
import java.io.IOException;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutionException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.security.oauth2.jwt.BadJwtException;

class ServerErrorLoggerTest {

    @Test
    @DisplayName("DB와 외부 연결의 Broken pipe를 클라이언트 SSE 종료로 오분류하지 않는다")
    void record_failure_disconnectPhraseInServerCause() {
        try (LogCapture logs = new LogCapture(ServerErrorLoggerTest.class)) {
            ServerErrorLogger.record(
                    LoggerFactory.getLogger(getClass()),
                    "phase=db",
                    new DataAccessResourceFailureException(
                            "private-sql",
                            new IOException("Broken pipe")
                    )
            );
            ServerErrorLogger.record(
                    LoggerFactory.getLogger(getClass()),
                    "phase=provider",
                    new SearchToolException(
                            "SEARCH_TRANSPORT_FAILED",
                            new IOException("Broken pipe")
                    )
            );
            assertThat(logs.events()).extracting(event -> event.getLevel())
                    .containsExactly(
                            Level.ERROR,
                            Level.WARN
                    );
        }
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"MODEL_GENERATION_FAILED", "INVALID_MCP_RESPONSE",
            "SEARCH_CONTEXT_LIMIT_EXCEEDED"})
    @DisplayName("알려진 외부 모델·MCP 실패는 WARN이며 내부 원인이 있으면 ERROR다")
    void record_failure_externalModelAndInternalCause(String code) {
        try (LogCapture logs = new LogCapture(ServerErrorLoggerTest.class)) {
            ServerErrorLogger.record(
                    LoggerFactory.getLogger(getClass()),
                    "phase=external",
                    new SearchToolException(code)
            );
            ServerErrorLogger.record(
                    LoggerFactory.getLogger(getClass()),
                    "phase=internal",
                    new SearchToolException(
                            code,
                            new IllegalStateException("private-sql")
                    )
            );
            assertThat(logs.events()).extracting(event -> event.getLevel())
                    .containsExactly(
                            Level.WARN,
                            Level.ERROR
                    );
        }
    }

    @Test
    @DisplayName("접근 거절 코드 안의 내부 원인과 알 수 없는 도구 코드를 숨기지 않는다")
    void isInternalFailure_failure_controlCodeWithInternalCause() {
        SearchToolException failure = new SearchToolException(
                "SEARCH_ACCESS_DENIED",
                new IllegalStateException("private-sql")
        );
        assertThat(ServerErrorLogger.isInternalFailure(failure)).isTrue();
        assertThat(ServerErrorLogger.isInternalFailure(new SearchToolException("UNKNOWN_INTERNAL_FAILURE"))).isTrue();
        try (LogCapture logs = new LogCapture(ServerErrorLoggerTest.class)) {
            ServerErrorLogger.record(
                    LoggerFactory.getLogger(getClass()),
                    "phase=access",
                    failure
            );
            assertThat(logs.events()).singleElement()
                    .satisfies(event -> assertThat(event.getLevel()).isEqualTo(Level.ERROR));
        }
    }

    @Test
    @DisplayName("외부 연결 실패는 WARN이며 ExecutionException 안의 내부 버그는 ERROR다")
    void record_failure_classifiesWrappedTransportCause() {
        try (LogCapture logs = new LogCapture(ServerErrorLoggerTest.class)) {
            ServerErrorLogger.record(
                    LoggerFactory.getLogger(getClass()),
                    "phase=external",
                    new LlmException(
                            LlmErrorCode.LLM_UNAVAILABLE,
                            new ExecutionException(new IOException("private-provider-body"))
                    )
            );
            ServerErrorLogger.record(
                    LoggerFactory.getLogger(getClass()),
                    "phase=internal",
                    new LlmException(
                            LlmErrorCode.LLM_UNAVAILABLE,
                            new ExecutionException(new IllegalStateException("private-sql"))
                    )
            );
            assertThat(logs.events()).extracting(event -> event.getLevel())
                    .containsExactly(
                            Level.WARN,
                            Level.ERROR
                    );
            assertThat(logs.events()).allSatisfy(event -> {
                assertThat(event.getFormattedMessage()).doesNotContain(
                        "private-provider-body",
                        "private-sql"
                );
                assertThat(event.getThrowableProxy()).isNull();
            });
        }
    }

    @Test
    @DisplayName("정상 JWT 거절의 공급자 내부 원인과 일반 입력 오류는 ERROR를 만들지 않는다")
    void record_success_expectedValidationIsSilent() {
        BadJwtException invalid = new BadJwtException(
                "private-token",
                new IllegalStateException("invalid signature")
        );
        try (LogCapture logs = new LogCapture(ServerErrorLoggerTest.class)) {
            ServerErrorLogger.record(
                    LoggerFactory.getLogger(getClass()),
                    "JWT",
                    new AuthException(
                            AuthErrorCode.INVALID_JWT,
                            invalid
                    )
            );
            ServerErrorLogger.record(
                    LoggerFactory.getLogger(getClass()),
                    "MCP",
                    new SearchToolException(
                            "INVALID_TOOL_ARGUMENTS",
                            new IllegalArgumentException("private-input")
                    )
            );
            assertThat(logs.events()).isEmpty();
        }
    }

    @Test
    @DisplayName("suppressed 내부 DB 오류도 기록 대상으로 판별하며 순환 원인은 종료한다")
    void isInternalFailure_failure_suppressedAndCycle() {
        AuthException outer = new AuthException(AuthErrorCode.UNAUTHENTICATED);
        DataAccessResourceFailureException db = new DataAccessResourceFailureException("private-sql");
        outer.addSuppressed(db);
        db.initCause(outer);
        assertThat(ServerErrorLogger.isInternalFailure(outer)).isTrue();
        try (LogCapture logs = new LogCapture(ServerErrorLoggerTest.class)) {
            ServerErrorLogger.record(
                    LoggerFactory.getLogger(getClass()),
                    "phase=auth",
                    outer
            );
            assertThat(logs.events()).singleElement()
                    .satisfies(event -> {
                        assertThat(event.getLevel()).isEqualTo(Level.ERROR);
                        assertThat(event.getFormattedMessage()).contains(
                                "suppressed=",
                                "DataAccessResourceFailureException"
                        )
                                .doesNotContain("private-sql");
                    });
        }
    }

    @Test
    @DisplayName("작업 취소와 클라이언트 연결 종료는 DEBUG이며 일반 IO 오류는 ERROR다")
    void record_success_cancelAndDisconnectAreControlFlow() {
        try (LogCapture logs = new LogCapture(ServerErrorLoggerTest.class)) {
            ServerErrorLogger.record(
                    LoggerFactory.getLogger(getClass()),
                    "cancel",
                    new SearchToolException(
                            "SEARCH_TRANSPORT_FAILED",
                            new CancellationException("private")
                    )
            );
            ServerErrorLogger.record(
                    LoggerFactory.getLogger(getClass()),
                    "disconnect",
                    new IOException("Broken pipe")
            );
            ServerErrorLogger.record(
                    LoggerFactory.getLogger(getClass()),
                    "write",
                    new IOException("private-write")
            );
            assertThat(logs.events()).extracting(event -> event.getLevel())
                    .containsExactly(
                            Level.DEBUG,
                            Level.DEBUG,
                            Level.ERROR
                    );
        }
    }
}
