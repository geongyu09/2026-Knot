package com.knot.backend.search.application;

import com.knot.backend.document.domain.DocumentRepository;
import com.knot.backend.global.config.SearchWorkerProperties;
import com.knot.backend.search.application.dto.result.SearchAnswerWorkResult;
import com.knot.backend.search.application.dto.result.SearchDocumentResult;
import com.knot.backend.search.domain.SearchAnswerExecution;
import com.knot.backend.search.domain.SearchConversation;
import com.knot.backend.search.domain.SearchEvidence;
import com.knot.backend.search.domain.SearchMessage;
import com.knot.backend.search.domain.SearchMessageStatus;
import com.knot.backend.search.domain.SearchRepository;
import com.knot.backend.workspace.domain.WorkspaceRepository;
import com.knot.backend.workspace.domain.WorkspaceMemberRepository;
import java.time.Clock;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class SearchAnswerExecutionService {

    private final SearchRepository repository;
    private final WorkspaceRepository workspaces;
    private final WorkspaceMemberRepository memberships;
    private final DocumentRepository documents;
    private final SearchWorkerProperties properties;
    private final Clock clock;

    public Optional<SearchAnswerWorkResult> claim(long answerId) {
        Optional<SearchAnswerExecution> locked = lockExecution(answerId);
        if (locked.isEmpty()) {
            return Optional.empty();
        }
        SearchAnswerExecution execution = locked.get();
        UUID token = UUID.randomUUID();
        if (!execution.claim(
                token,
                clock.instant(),
                properties.getExecutionLease()
        )) {
            return Optional.empty();
        }
        SearchConversation conversation = conversation(execution);
        if (!hasAccess(conversation)) {
            finishFailure(
                    execution,
                    "SEARCH_ACCESS_DENIED"
            );
            return Optional.empty();
        }
        SearchMessage question = repository.findMessage(execution.getQuestionId())
                .orElseThrow();
        return Optional.of(
                new SearchAnswerWorkResult(
                        conversation.getWorkspaceId(),
                        conversation.getMemberId(),
                        conversation.getId(),
                        question.getId(),
                        answerId,
                        token,
                        question.getContent()
                )
        );
    }

    public boolean recordRetrieval(
            long answerId,
            UUID token,
            int excludedCount,
            List<SearchDocumentResult> candidates
    ) {
        Optional<SearchAnswerExecution> current = currentExecution(
                answerId,
                token
        );
        if (current.isEmpty()) {
            return false;
        }
        SearchAnswerExecution execution = current.get();
        long workspaceId = conversation(execution).getWorkspaceId();
        Set<Long> ids = new HashSet<>();
        for (SearchDocumentResult candidate : candidates) {
            if (!ids.add(candidate.documentId())) {
                throw new IllegalArgumentException("duplicate candidate document");
            }
            requireDocument(
                    workspaceId,
                    candidate.documentId()
            );
        }
        execution.recordRetrieval(excludedCount);
        return true;
    }

    public boolean append(
            long answerId,
            UUID token,
            String text
    ) {
        Optional<SearchAnswerExecution> current = currentExecution(
                answerId,
                token
        );
        if (current.isEmpty()) {
            return false;
        }
        SearchAnswerExecution execution = current.get();
        answer(execution).appendContent(text);
        conversation(execution).recordMessageActivity(clock.instant());
        return true;
    }

    private Optional<SearchAnswerExecution> lockExecution(long answerId) {
        Optional<SearchAnswerExecution> found = repository.findExecution(answerId);
        if (found.isEmpty()) {
            return Optional.empty();
        }
        SearchConversation conversation = conversation(found.get());
        workspaces.findIncludingDeletedByIdForUpdate(conversation.getWorkspaceId())
                .orElseThrow();
        repository.findConversationForUpdate(conversation.getId())
                .orElseThrow();
        return repository.findExecutionForUpdate(answerId);
    }

    private Optional<SearchAnswerExecution> currentExecution(
            long answerId,
            UUID token
    ) {
        Optional<SearchAnswerExecution> locked = lockExecution(answerId);
        if (locked.isEmpty()) {
            return Optional.empty();
        }
        SearchAnswerExecution execution = locked.get();
        if (!execution.isCurrent(
                token,
                clock.instant()
        )) {
            return Optional.empty();
        }
        if (!hasAccess(conversation(execution))) {
            finishFailure(
                    execution,
                    "SEARCH_ACCESS_DENIED"
            );
            return Optional.empty();
        }
        return locked;
    }

    private boolean hasAccess(SearchConversation conversation) {
        return memberships.existsByWorkspaceIdAndMemberId(
                conversation.getWorkspaceId(),
                conversation.getMemberId()
        );
    }

    private SearchConversation conversation(SearchAnswerExecution execution) {
        return repository.findConversation(execution.getConversationId())
                .orElseThrow();
    }

    private SearchMessage answer(SearchAnswerExecution execution) {
        return repository.findMessage(execution.getAnswerId())
                .orElseThrow();
    }

    private void requireDocument(
            long workspaceId,
            long documentId
    ) {
        documents.findByWorkspaceIdAndIdForUpdate(
                workspaceId,
                documentId
        )
                .orElseThrow(() -> new IllegalArgumentException("document is outside workspace"));
    }

    private void validateUsedDocuments(
            List<Long> ids,
            Set<Long> candidates
    ) {
        if (ids == null || ids.size() > 3) {
            throw new IllegalArgumentException("at most three evidence documents are allowed");
        }
        if (new HashSet<>(ids).size() != ids.size()) {
            throw new IllegalArgumentException("duplicate evidence document");
        }
        if (!candidates.containsAll(ids)) {
            throw new IllegalArgumentException("evidence document was not retrieved");
        }
    }

    private void finishFailure(
            SearchAnswerExecution execution,
            String code
    ) {
        answer(execution).fail(code);
        execution.finish();
        recordTerminalActivity(
                conversation(execution),
                execution,
                SearchMessageStatus.FAILED
        );
    }

    private void recordTerminalActivity(
            SearchConversation conversation,
            SearchAnswerExecution execution,
            SearchMessageStatus status
    ) {
        SearchMessage question = repository.findMessage(execution.getQuestionId())
                .orElseThrow();
        if (question.getSequence() == 1) {
            conversation.recordFirstAnswerStatus(status);
        }
        conversation.recordMessageActivity(clock.instant());
    }
}
