package com.knot.backend.search.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SearchAnswerRetryTest {
    private static final Instant NOW = Instant.parse("2026-10-12T00:00:00Z");

    @Test
    @DisplayName("실패 답변은 식별자·순서를 보존하고 본문·오류를 초기화한다")
    void retry_success_failedAnswer() {
        // given
        SearchMessage answer = SearchMessage.startAnswer(
                1,
                2,
                NOW
        );
        answer.appendContent("이전 부분 답변");
        answer.fail("ANSWER_GENERATION_FAILED");
        // when
        answer.retry();
        // then
        assertThat(answer.getStatus()).isEqualTo(SearchMessageStatus.STREAMING);
        assertThat(answer.getContent()).isEmpty();
        assertThat(answer.getFailureCode()).isNull();
        assertThat(answer.getSequence()).isEqualTo(2);
        assertThat(answer.getConversationId()).isEqualTo(1);
        assertThat(answer.getCreatedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("실패한 ASSISTANT 이외의 메시지는 재시도하지 않는다")
    void retry_failure_invalidMessageState() {
        // given
        SearchMessage streaming = SearchMessage.startAnswer(
                1,
                2,
                NOW
        );
        SearchMessage user = SearchMessage.receiveQuestion(
                1,
                1,
                "질문",
                NOW
        );
        // when & then
        assertThatIllegalStateException().isThrownBy(streaming::retry);
        assertThatIllegalStateException().isThrownBy(user::retry);
        streaming.stop();
        assertThatIllegalStateException().isThrownBy(streaming::retry);
    }

    @Test
    @DisplayName("종료 실행은 대기로 복구하고 이전 token과 진행 정보를 지운다")
    void retry_success_finishedExecution() {
        // given
        SearchAnswerExecution execution = SearchAnswerExecution.queue(
                1,
                2,
                3,
                NOW
        );
        UUID oldToken = UUID.randomUUID();
        execution.claim(
                oldToken,
                NOW,
                Duration.ofMinutes(1)
        );
        execution.recordRetrieval(4);
        execution.finish();
        // when
        execution.retry();
        // then
        assertThat(execution.getState()).isEqualTo(SearchExecutionState.QUEUED);
        assertThat(execution.getExecutionToken()).isNull();
        assertThat(execution.getDeadlineAt()).isNull();
        assertThat(execution.getStage()).isNull();
        assertThat(execution.getExcludedCount()).isNull();
        assertThat(
                execution.isCurrent(
                        oldToken,
                        NOW
                )
        ).isFalse();
        UUID newToken = UUID.randomUUID();
        assertThat(
                execution.claim(
                        newToken,
                        NOW,
                        Duration.ofMinutes(1)
                )
        ).isTrue();
        assertThat(
                execution.isCurrent(
                        oldToken,
                        NOW
                )
        ).isFalse();
        assertThat(
                execution.isCurrent(
                        newToken,
                        NOW
                )
        ).isTrue();
        assertThat(execution.getCreatedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("대기·실행 중 작업은 재시도 초기화를 거절한다")
    void retry_failure_activeExecution() {
        // given
        SearchAnswerExecution execution = SearchAnswerExecution.queue(
                1,
                2,
                3,
                NOW
        );
        // when & then
        assertThatIllegalStateException().isThrownBy(execution::retry);
        execution.claim(
                UUID.randomUUID(),
                NOW,
                Duration.ofMinutes(1)
        );
        assertThatIllegalStateException().isThrownBy(execution::retry);
    }

    @Test
    @DisplayName("재시도 receipt는 기존 질문을 target으로 저장하고 UUID를 검증한다")
    void retry_success_scopedReceipt() {
        // given
        UUID requestId = UUID.randomUUID();
        // when
        SearchRequestReceipt receipt = SearchRequestReceipt.retry(
                1,
                2,
                requestId,
                3,
                4,
                5,
                NOW
        );
        // then
        assertThat(receipt.getOperation()).isEqualTo(SearchRequestOperation.RETRY);
        assertThat(receipt.getTargetId()).isEqualTo(4);
        assertThat(receipt.getQuestionMessageId()).isEqualTo(4);
        assertThat(receipt.getAnswerMessageId()).isEqualTo(5);
        assertThatIllegalArgumentException().isThrownBy(
                () -> SearchRequestReceipt.retry(
                        1,
                        2,
                        null,
                        3,
                        4,
                        5,
                        NOW
                )
        );
    }
}
