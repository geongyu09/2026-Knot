package com.knot.backend.workspace.presentation;

import com.knot.backend.auth.domain.model.AuthenticatedMember;
import com.knot.backend.workspace.application.WorkspaceLeaveService;
import com.knot.backend.workspace.presentation.dto.response.WorkspaceOwnershipTransferCandidateResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/workspaces")
@RequiredArgsConstructor
public class WorkspaceOwnershipTransferCandidateController implements WorkspaceOwnershipTransferCandidateApi {
    private final WorkspaceLeaveService workspaceLeaveService;

    @Override
    @GetMapping("/{workspaceId}/ownership-transfer-candidates")
    public List<WorkspaceOwnershipTransferCandidateResponse> findCandidates(
            @PathVariable Long workspaceId,
            @AuthenticationPrincipal AuthenticatedMember authenticatedMember
    ) {
        return workspaceLeaveService.findOwnershipTransferCandidates(
                workspaceId,
                authenticatedMember.getMemberId()
        )
                .stream()
                .map(WorkspaceOwnershipTransferCandidateResponse::from)
                .toList();
    }
}
