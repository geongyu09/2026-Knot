package com.knot.backend.search.domain.model;

import com.knot.backend.search.domain.SearchErrorCode;
import com.knot.backend.search.domain.SearchException;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

@Getter
@Entity
@Table(name = "search_request_receipts")
public class SearchRequestReceipt {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "workspace_id", nullable = false, updatable = false)
    private long workspaceId;

    @Column(name = "member_id", nullable = false, updatable = false)
    private long memberId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false, length = 30)
    private SearchRequestOperation operation;

    @Column(name = "target_id", nullable = false, updatable = false)
    private long targetId;

    @Column(name = "request_id", nullable = false, updatable = false)
    private UUID requestId;

    @Column(name = "conversation_id", nullable = false, updatable = false)
    private long conversationId;

    @Column(name = "question_message_id", nullable = false, updatable = false)
    private long questionMessageId;

    @Column(name = "answer_message_id", nullable = false, updatable = false)
    private long answerMessageId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected SearchRequestReceipt() {}

    public static SearchRequestReceipt question(
            long workspaceId,
            long memberId,
            UUID requestId,
            long conversationId,
            long questionMessageId,
            long answerMessageId,
            Instant createdAt
    ) {
        SearchRequestReceipt receipt = firstQuestion(
                workspaceId,
                memberId,
                requestId,
                conversationId,
                questionMessageId,
                answerMessageId,
                createdAt
        );
        receipt.operation = SearchRequestOperation.QUESTION;
        receipt.targetId = conversationId;
        return receipt;
    }

    public static SearchRequestReceipt retry(
            long workspaceId,
            long memberId,
            UUID requestId,
            long conversationId,
            long questionMessageId,
            long answerMessageId,
            Instant createdAt
    ) {
        SearchRequestReceipt receipt = firstQuestion(
                workspaceId,
                memberId,
                requestId,
                conversationId,
                questionMessageId,
                answerMessageId,
                createdAt
        );
        receipt.operation = SearchRequestOperation.RETRY;
        receipt.targetId = questionMessageId;
        return receipt;
    }

    public static SearchRequestReceipt firstQuestion(
            long workspaceId,
            long memberId,
            UUID requestId,
            long conversationId,
            long questionMessageId,
            long answerMessageId,
            Instant createdAt
    ) {
        if (workspaceId <= 0 || memberId <= 0 || conversationId <= 0) {
            throw new SearchException(SearchErrorCode.INVALID_SEARCH_STATE);
        }
        if (questionMessageId <= 0 || answerMessageId <= 0 || questionMessageId == answerMessageId) {
            throw new SearchException(SearchErrorCode.INVALID_SEARCH_STATE);
        }
        if (requestId == null || createdAt == null) {
            throw new SearchException(SearchErrorCode.INVALID_SEARCH_STATE);
        }
        SearchRequestReceipt receipt = new SearchRequestReceipt();
        receipt.workspaceId = workspaceId;
        receipt.memberId = memberId;
        receipt.operation = SearchRequestOperation.FIRST_QUESTION;
        receipt.targetId = 0;
        receipt.requestId = requestId;
        receipt.conversationId = conversationId;
        receipt.questionMessageId = questionMessageId;
        receipt.answerMessageId = answerMessageId;
        receipt.createdAt = createdAt;
        return receipt;
    }
}
