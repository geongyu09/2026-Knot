package com.knot.backend.search.application;

import com.knot.backend.search.application.dto.result.SearchAnswerSnapshotResult;
import com.knot.backend.search.application.dto.result.SearchEvidenceItemResult;
import com.knot.backend.search.domain.SearchAnswerExecution;
import com.knot.backend.search.domain.SearchConversation;
import com.knot.backend.search.domain.SearchMessage;
import com.knot.backend.search.domain.SearchRepository;
import com.knot.backend.search.domain.SearchErrorCode;
import com.knot.backend.search.domain.SearchException;
import com.knot.backend.workspace.domain.WorkspaceMemberRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class SearchAnswerSnapshotService {

    private final SearchRepository repository;
    private final WorkspaceMemberRepository memberships;
    private final SearchMessageListQuery messages;

    public SearchAnswerSnapshotResult read(
            long workspaceId,
            long memberId,
            long answerId
    ) {
        SearchAnswerExecution execution = repository.findExecution(answerId)
                .orElseThrow();
        SearchConversation conversation = repository.findConversation(execution.getConversationId())
                .orElseThrow();
        validateAccess(
                workspaceId,
                memberId,
                conversation
        );
        SearchMessage answer = repository.findMessage(answerId)
                .orElseThrow();
        List<SearchEvidenceItemResult> evidences = messages.findEvidences(
                workspaceId,
                memberId,
                conversation.getId(),
                List.of(answerId)
        )
                .getOrDefault(
                        answerId,
                        List.of()
                );
        return new SearchAnswerSnapshotResult(
                answerId,
                answer.getContent(),
                answer.getStatus(),
                answer.getFailureCode(),
                execution.getExecutionToken(),
                execution.getStage(),
                execution.getExcludedCount(),
                List.copyOf(evidences)
        );
    }

    private void validateAccess(
            long workspaceId,
            long memberId,
            SearchConversation conversation
    ) {
        if (conversation.getWorkspaceId() != workspaceId || conversation.getMemberId() != memberId) {
            throw new SearchException(SearchErrorCode.SEARCH_ACCESS_DENIED);
        }
        if (!memberships.existsByWorkspaceIdAndMemberId(
                workspaceId,
                memberId
        )) {
            throw new SearchException(SearchErrorCode.SEARCH_ACCESS_DENIED);
        }
    }
}
