package com.knot.backend.search.domain;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SearchRepository {

    SearchConversation save(SearchConversation conversation);

    SearchMessage save(SearchMessage message);

    SearchRequestReceipt save(SearchRequestReceipt receipt);

    SearchAnswerExecution save(SearchAnswerExecution execution);

    SearchEvidence save(SearchEvidence evidence);

    Optional<SearchRequestReceipt> findFirstReceipt(
            long workspaceId,
            long memberId,
            UUID requestId
    );

    Optional<SearchConversation> findConversation(long conversationId);

    Optional<SearchRequestReceipt> findQuestionReceipt(
            long workspaceId,
            long memberId,
            long conversationId,
            UUID requestId
    );

    Optional<SearchConversation> findConversationForUpdate(long conversationId);

    Optional<SearchMessage> findMessage(long messageId);

    Optional<SearchAnswerExecution> findExecution(long answerId);

    Optional<SearchAnswerExecution> findExecutionForUpdate(long answerId);

    List<Long> findQueuedAnswerIds(int limit);

    List<Long> findExpiredAnswerIds(
            Instant now,
            int limit
    );

    void flush();
}
