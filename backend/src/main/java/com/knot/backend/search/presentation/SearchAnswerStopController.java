package com.knot.backend.search.presentation;

import com.knot.backend.auth.domain.AuthenticatedMember;
import com.knot.backend.search.application.SearchAnswerExecutionService;
import com.knot.backend.search.presentation.dto.response.SearchAnswerStopResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/workspaces/{workspaceId}/search/conversations/{conversationId}/answers")
public class SearchAnswerStopController implements SearchAnswerStopApi {

    private final SearchAnswerExecutionService executions;

    @Override
    @PostMapping(value = "/{answerId}/stop", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<SearchAnswerStopResponse> stop(
            @PathVariable Long workspaceId,
            @PathVariable Long conversationId,
            @PathVariable Long answerId,
            @AuthenticationPrincipal AuthenticatedMember member
    ) {
        return ResponseEntity.ok(
                SearchAnswerStopResponse.from(
                        executions.stop(
                                workspaceId,
                                member.getMemberId(),
                                conversationId,
                                answerId
                        )
                )
        );
    }
}
