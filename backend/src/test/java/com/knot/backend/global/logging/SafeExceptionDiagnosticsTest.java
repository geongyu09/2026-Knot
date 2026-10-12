package com.knot.backend.global.logging;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SafeExceptionDiagnosticsTest {

    @Test
    @DisplayName("진단은 원인과 suppressed의 종류·위치를 남기고 비밀 메시지를 제외한다")
    void describe_success_preservesTypesWithoutMessages() {
        // given
        IllegalStateException cause = new IllegalStateException("cause-private-token");
        RuntimeException exception = new RuntimeException(
                "root-private-sql",
                cause
        );
        exception.addSuppressed(new IllegalArgumentException("suppressed-private-cookie"));

        // when
        String diagnostic = SafeExceptionDiagnostics.describe(exception);

        // then
        assertThat(diagnostic).contains(
                "RuntimeException",
                "IllegalStateException",
                "IllegalArgumentException",
                "cause",
                "suppressed",
                "SafeExceptionDiagnosticsTest.java"
        );
        assertThat(diagnostic).doesNotContain(
                "root-private-sql",
                "cause-private-token",
                "suppressed-private-cookie"
        );
    }

    @Test
    @DisplayName("순환 원인 체인은 중단하고 생략을 표시한다")
    void describe_success_cycleTerminates() {
        // given
        RuntimeException first = new RuntimeException("first-private");
        RuntimeException second = new RuntimeException(
                "second-private",
                first
        );
        first.initCause(second);

        // when
        String diagnostic = SafeExceptionDiagnostics.describe(first);

        // then
        assertThat(diagnostic).contains("cycle");
        assertThat(diagnostic).doesNotContain(
                "first-private",
                "second-private"
        );
        assertThat(diagnostic.length()).isLessThanOrEqualTo(4096);
    }

    @Test
    @DisplayName("긴 체인·빈 스택·null도 제한된 진단으로 처리한다")
    void describe_success_boundedAndEmpty() {
        // given
        Throwable exception = new RuntimeException("private");
        for (int index = 0; index < 100; index++) {
            exception = new RuntimeException(
                    "private",
                    exception
            );
        }
        exception.setStackTrace(new StackTraceElement[0]);

        // when
        String diagnostic = SafeExceptionDiagnostics.describe(exception);

        // then
        assertThat(diagnostic).contains("omitted");
        assertThat(diagnostic.length()).isLessThanOrEqualTo(4096);
        assertThat(SafeExceptionDiagnostics.describe(null)).isEqualTo("unknown");
    }
}
