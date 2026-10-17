package com.knot.backend.search.domain.model;

import com.knot.backend.search.domain.SearchException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SearchRequestReceiptTest {

    @Test
    @DisplayName("후속 질문 접수는 QUESTION과 대상 대화를 기록한다")
    void question_success_scopedReceipt() {
        // given
        UUID requestId = UUID.randomUUID();
        Instant now = Instant.now();
        // when
        SearchRequestReceipt receipt = SearchRequestReceipt.question(
                1,
                2,
                requestId,
                3,
                4,
                5,
                now
        );
        // then
        assertThat(receipt.getOperation()).isEqualTo(SearchRequestOperation.QUESTION);
        assertThat(receipt.getTargetId()).isEqualTo(3);
        assertThat(receipt.getConversationId()).isEqualTo(3);
        assertThat(receipt.getWorkspaceId()).isEqualTo(1);
        assertThat(receipt.getMemberId()).isEqualTo(2);
        assertThat(receipt.getRequestId()).isEqualTo(requestId);
        assertThat(receipt.getQuestionMessageId()).isEqualTo(4);
        assertThat(receipt.getAnswerMessageId()).isEqualTo(5);
        assertThat(receipt.getCreatedAt()).isEqualTo(now);
    }

    @Test
    @DisplayName("후속 접수도 잘못된 범위·메시지·필수값을 거절한다")
    void question_failure_invalidReceipt() {
        // given
        UUID requestId = UUID.randomUUID();
        Instant now = Instant.now();
        // when & then
        assertThatThrownBy(
                () -> SearchRequestReceipt.question(
                        0,
                        2,
                        requestId,
                        3,
                        4,
                        5,
                        now
                )
        ).isInstanceOf(SearchException.class);
        assertThatThrownBy(
                () -> SearchRequestReceipt.question(
                        1,
                        0,
                        requestId,
                        3,
                        4,
                        5,
                        now
                )
        ).isInstanceOf(SearchException.class);
        assertThatThrownBy(
                () -> SearchRequestReceipt.question(
                        1,
                        2,
                        requestId,
                        0,
                        4,
                        5,
                        now
                )
        ).isInstanceOf(SearchException.class);
        assertThatThrownBy(
                () -> SearchRequestReceipt.question(
                        1,
                        2,
                        requestId,
                        3,
                        0,
                        5,
                        now
                )
        ).isInstanceOf(SearchException.class);
        assertThatThrownBy(
                () -> SearchRequestReceipt.question(
                        1,
                        2,
                        requestId,
                        3,
                        4,
                        4,
                        now
                )
        ).isInstanceOf(SearchException.class);
        assertThatThrownBy(
                () -> SearchRequestReceipt.question(
                        1,
                        2,
                        null,
                        3,
                        4,
                        5,
                        now
                )
        ).isInstanceOf(SearchException.class);
        assertThatThrownBy(
                () -> SearchRequestReceipt.question(
                        1,
                        2,
                        requestId,
                        3,
                        4,
                        5,
                        null
                )
        ).isInstanceOf(SearchException.class);
    }
}
