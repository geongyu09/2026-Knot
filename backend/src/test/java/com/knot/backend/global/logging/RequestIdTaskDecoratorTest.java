package com.knot.backend.global.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

class RequestIdTaskDecoratorTest {

    @AfterEach
    void tearDown() {
        MDC.clear();
    }

    @Test
    @DisplayName("SSE 작업 제출 시점의 ID를 전달하고 작업 스레드의 기존 문맥을 복원한다")
    void decorate_success_capturesAndRestores() throws Exception {
        // given
        MDC.put(
                "requestId",
                "submitted"
        );
        Runnable decorated = new RequestIdTaskDecorator().decorate(() -> {
            assertThat(MDC.get("requestId")).isEqualTo("submitted");
            assertThat(MDC.get("worker")).isEqualTo("preserved");
        });
        MDC.put(
                "requestId",
                "caller-changed"
        );

        // when & then
        try (ExecutorService executor = Executors.newSingleThreadExecutor()) {
            executor.submit(() -> {
                MDC.put(
                        "requestId",
                        "previous-worker"
                );
                MDC.put(
                        "worker",
                        "preserved"
                );
                decorated.run();
                assertThat(MDC.get("requestId")).isEqualTo("previous-worker");
                MDC.clear();
            })
                    .get();
        }
        assertThat(MDC.get("requestId")).isEqualTo("caller-changed");
    }

    @Test
    @DisplayName("ID 없는 작업과 예외 발생 시에도 다른 요청의 ID를 사용하거나 남기지 않는다")
    void decorate_failure_restoresAfterException() {
        // given
        Runnable decorated = new RequestIdTaskDecorator().decorate(() -> {
            assertThat(MDC.get("requestId")).isNull();
            throw new IllegalStateException("failure");
        });
        MDC.put(
                "requestId",
                "previous-worker"
        );

        // when & then
        assertThatThrownBy(decorated::run).isInstanceOf(IllegalStateException.class);

        assertThat(MDC.get("requestId")).isEqualTo("previous-worker");
    }
}
