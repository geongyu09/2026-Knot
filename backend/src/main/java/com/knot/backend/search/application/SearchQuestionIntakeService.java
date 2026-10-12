package com.knot.backend.search.application;

import com.knot.backend.search.application.dto.command.SearchQuestionCommand;
import com.knot.backend.search.application.dto.result.SearchQuestionAcceptedResult;
import com.knot.backend.search.domain.SearchAnswerExecution;
import com.knot.backend.search.domain.SearchConversation;
import com.knot.backend.search.domain.SearchErrorCode;
import com.knot.backend.search.domain.SearchException;
import com.knot.backend.search.domain.SearchMessage;
import com.knot.backend.search.domain.SearchRepository;
import com.knot.backend.search.domain.SearchRequestReceipt;
import com.knot.backend.workspace.domain.WorkspaceRepository;
import com.knot.backend.workspace.domain.WorkspaceMemberRepository;
import com.knot.backend.workspace.domain.WorkspaceMember;
import com.knot.backend.workspace.domain.WorkspaceErrorCode;
import com.knot.backend.workspace.domain.WorkspaceException;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SearchQuestionIntakeService {

    private final WorkspaceRepository workspaces;
    private final WorkspaceMemberRepository memberships;
    private final SearchRepository repository;
    private final SearchGenerationAvailability availability;
    private final Clock clock;

    @Transactional
    public SearchQuestionAcceptedResult acceptFirst(
            long workspaceId,
            long memberId,
            SearchQuestionCommand command
    ) {
        validateScope(
                workspaceId,
                memberId
        );
        lockMembership(
                workspaceId,
                memberId
        );
        Optional<SearchRequestReceipt> existing = repository.findFirstReceipt(
                workspaceId,
                memberId,
                command.requestId()
        );
        if (existing.isPresent()) {
            return restore(
                    existing.get(),
                    command.content()
            );
        }
        availability.requireAvailable();
        return create(
                workspaceId,
                memberId,
                command
        );
    }

    private void validateScope(
            long workspaceId,
            long memberId
    ) {
        if (workspaceId <= 0 || memberId <= 0) {
            throw new SearchException(SearchErrorCode.INVALID_PARAMETER);
        }
    }

    private void lockMembership(
            long workspaceId,
            long memberId
    ) {
        workspaces.findByIdForUpdate(workspaceId)
                .orElseThrow(() -> new WorkspaceException(WorkspaceErrorCode.WORKSPACE_ACCESS_DENIED));
        WorkspaceMember membership = memberships.findLatestByWorkspaceIdAndMemberIdForUpdate(
                workspaceId,
                memberId
        )
                .orElseThrow(() -> new WorkspaceException(WorkspaceErrorCode.WORKSPACE_ACCESS_DENIED));
        if (!membership.isActive()) {
            throw new WorkspaceException(WorkspaceErrorCode.WORKSPACE_ACCESS_DENIED);
        }
    }

    private SearchQuestionAcceptedResult restore(
            SearchRequestReceipt receipt,
            String content
    ) {
        SearchMessage question = repository.findMessage(receipt.getQuestionMessageId())
                .orElseThrow();
        if (!question.getContent()
                .equals(content)) {
            throw new SearchException(SearchErrorCode.REQUEST_ID_CONFLICT);
        }
        return new SearchQuestionAcceptedResult(
                receipt.getConversationId(),
                receipt.getQuestionMessageId(),
                receipt.getAnswerMessageId()
        );
    }

    private SearchQuestionAcceptedResult create(
            long workspaceId,
            long memberId,
            SearchQuestionCommand command
    ) {
        Instant acceptedAt = clock.instant();
        SearchConversation conversation = repository.save(
                SearchConversation.create(
                        workspaceId,
                        memberId,
                        acceptedAt
                )
        );
        long conversationId = conversation.getId();
        SearchMessage question = repository.save(
                SearchMessage.receiveQuestion(
                        conversationId,
                        1,
                        command.content(),
                        acceptedAt
                )
        );
        SearchMessage answer = repository.save(
                SearchMessage.startAnswer(
                        conversationId,
                        2,
                        acceptedAt
                )
        );
        repository.save(
                SearchRequestReceipt.firstQuestion(
                        workspaceId,
                        memberId,
                        command.requestId(),
                        conversationId,
                        question.getId(),
                        answer.getId(),
                        acceptedAt
                )
        );
        repository.save(
                SearchAnswerExecution.queue(
                        conversationId,
                        question.getId(),
                        answer.getId(),
                        acceptedAt
                )
        );
        repository.flush();
        return new SearchQuestionAcceptedResult(
                conversationId,
                question.getId(),
                answer.getId()
        );
    }
}
