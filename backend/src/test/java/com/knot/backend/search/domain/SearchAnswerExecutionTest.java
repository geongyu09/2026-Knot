package com.knot.backend.search.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SearchAnswerExecutionTest {
    private static final Instant NOW = Instant.parse("2026-10-11T00:00:00Z");

    @Test
    @DisplayName("대기 작업을 중지하면 선점과 복구 대상에서 제외한다")
    void stop_success_queuedExecution() {
        SearchAnswerExecution execution = SearchAnswerExecution.queue(
                1,
                2,
                3,
                NOW
        );
        execution.stop();
        assertThat(execution.getState()).isEqualTo(SearchExecutionState.FINISHED);
        assertThat(execution.getExecutionToken()).isNull();
        assertThat(execution.getDeadlineAt()).isNull();
        assertThat(execution.getStage()).isNull();
        assertThat(
                execution.claim(
                        UUID.randomUUID(),
                        NOW,
                        Duration.ofSeconds(10)
                )
        ).isFalse();
        assertThat(execution.isExpired(NOW.plusSeconds(20))).isFalse();
    }

    @Test
    @DisplayName("실행 작업을 중지하면 기존 token과 기한을 보존하고 늦은 저장을 거절한다")
    void stop_success_runningExecution() {
        SearchAnswerExecution execution = SearchAnswerExecution.queue(
                1,
                2,
                3,
                NOW
        );
        UUID token = UUID.randomUUID();
        execution.claim(
                token,
                NOW,
                Duration.ofSeconds(10)
        );
        execution.stop();
        assertThat(execution.getState()).isEqualTo(SearchExecutionState.FINISHED);
        assertThat(execution.getExecutionToken()).isEqualTo(token);
        assertThat(
                execution.isCurrent(
                        token,
                        NOW
                )
        ).isFalse();
        assertThatIllegalStateException().isThrownBy(() -> execution.recordRetrieval(0));
        assertThatIllegalStateException().isThrownBy(execution::stop);
    }

    @Test
    @DisplayName("대기 작업만 선점하며 token과 기한이 현재 실행을 결정한다")
    void claim_success_onceAndLease() {
        SearchAnswerExecution execution = SearchAnswerExecution.queue(
                1,
                2,
                3,
                NOW
        );
        UUID token = UUID.randomUUID();
        assertThat(
                execution.claim(
                        token,
                        NOW,
                        Duration.ofSeconds(10)
                )
        ).isTrue();
        assertThat(
                execution.claim(
                        UUID.randomUUID(),
                        NOW,
                        Duration.ofSeconds(10)
                )
        ).isFalse();
        assertThat(
                execution.isCurrent(
                        token,
                        NOW.plusSeconds(9)
                )
        ).isTrue();
        assertThat(
                execution.isCurrent(
                        UUID.randomUUID(),
                        NOW
                )
        ).isFalse();
        assertThat(
                execution.isCurrent(
                        token,
                        NOW.plusSeconds(10)
                )
        ).isFalse();
        assertThat(execution.isExpired(NOW.plusSeconds(10))).isTrue();
    }

    @Test
    @DisplayName("완료 실행은 종료되고 이후 token 저장을 허용하지 않는다")
    void finish_success_fencesCallbacks() {
        SearchAnswerExecution execution = SearchAnswerExecution.queue(
                1,
                2,
                3,
                NOW
        );
        UUID token = UUID.randomUUID();
        execution.claim(
                token,
                NOW,
                Duration.ofSeconds(10)
        );
        execution.recordRetrieval(4);
        execution.finish();
        assertThat(execution.getExcludedCount()).isEqualTo(4);
        assertThat(execution.getStage()).isEqualTo(SearchProgressStage.GENERATING);
        assertThat(
                execution.isCurrent(
                        token,
                        NOW
                )
        ).isFalse();
        assertThatIllegalStateException().isThrownBy(() -> execution.recordRetrieval(1));
    }

    @Test
    @DisplayName("대기 실행의 종료와 음수 제외 수 및 잘못된 기한은 거절한다")
    void execution_failure_invalidStateAndLease() {
        SearchAnswerExecution execution = SearchAnswerExecution.queue(
                1,
                2,
                3,
                NOW
        );
        assertThatIllegalStateException().isThrownBy(execution::finish);
        assertThatIllegalArgumentException().isThrownBy(
                () -> execution.claim(
                        UUID.randomUUID(),
                        NOW,
                        Duration.ZERO
                )
        );
        execution.claim(
                UUID.randomUUID(),
                NOW,
                Duration.ofSeconds(10)
        );
        assertThatIllegalStateException().isThrownBy(() -> execution.recordRetrieval(-1));
    }
}
