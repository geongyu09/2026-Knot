package com.knot.backend.workspace.application;

import com.knot.backend.workspace.application.dto.result.WorkspaceCreateResult;
import com.knot.backend.workspace.application.dto.result.WorkspaceDetailResult;
import com.knot.backend.workspace.application.dto.result.WorkspaceListResult;
import com.knot.backend.workspace.domain.Workspace;
import com.knot.backend.workspace.domain.WorkspaceErrorCode;
import com.knot.backend.workspace.domain.WorkspaceException;
import com.knot.backend.workspace.domain.WorkspaceMember;
import com.knot.backend.workspace.domain.WorkspaceMemberRepository;
import com.knot.backend.workspace.domain.WorkspaceRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class WorkspaceService {
    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final WorkspaceDetailQuery workspaceDetailQuery;
    private final Clock clock;

    @Transactional
    public WorkspaceCreateResult create(
            long memberId,
            String name
    ) {
        Workspace workspace = workspaceRepository.save(
                Workspace.create(
                        name,
                        Instant.now(clock)
                )
        );
        workspaceMemberRepository.save(workspace.createOwnerMembership(memberId));
        return new WorkspaceCreateResult(workspace.getId());
    }

    @Transactional(readOnly = true)
    public WorkspaceDetailResult findDetail(
            Long workspaceId,
            Long memberId
    ) {
        validateWorkspaceId(workspaceId);
        WorkspaceDetailResult detail = workspaceDetailQuery.find(
                workspaceId,
                memberId
        )
                .orElseThrow(() -> new WorkspaceException(WorkspaceErrorCode.WORKSPACE_NOT_FOUND));
        if (!detail.isMember()) {
            throw new WorkspaceException(WorkspaceErrorCode.WORKSPACE_ACCESS_DENIED);
        }
        return detail;
    }

    @Transactional(readOnly = true)
    public WorkspaceListResult findAllByMemberId(long memberId) {
        List<Workspace> workspaces = workspaceRepository.findAllByMemberId(memberId);
        Long lastViewedWorkspaceId = workspaceMemberRepository.findLastViewedByMemberId(memberId)
                .map(WorkspaceMember::getWorkspaceId)
                .filter(
                        workspaceId -> containsWorkspace(
                                workspaces,
                                workspaceId
                        )
                )
                .orElse(null);
        return WorkspaceListResult.from(
                lastViewedWorkspaceId,
                workspaces
        );
    }

    // 마지막 조회 표시는 멤버당 하나만 허용되므로 기존 표시 해제를 먼저 반영한 뒤 대상을 표시한다.
    @Transactional
    public void updateLastViewed(
            long memberId,
            Long workspaceId
    ) {
        List<WorkspaceMember> workspaceMembers = workspaceMemberRepository.findAllByMemberIdForUpdate(memberId);
        WorkspaceMember target = findMembership(
                workspaceMembers,
                workspaceId
        );
        workspaceMembers.forEach(WorkspaceMember::clearLastViewed);
        workspaceMemberRepository.saveAll(workspaceMembers);
        workspaceMemberRepository.flush();
        target.markLastViewed();
        workspaceMemberRepository.save(target);
    }

    // 두 조회 사이에 탈퇴가 커밋되면 마지막 조회 워크스페이스가 목록에서 빠질 수 있어 목록에 있는 것만 반환한다.
    private boolean containsWorkspace(
            List<Workspace> workspaces,
            Long workspaceId
    ) {
        return workspaces.stream()
                .anyMatch(
                        workspace -> workspace.getId()
                                .equals(workspaceId)
                );
    }

    private WorkspaceMember findMembership(
            List<WorkspaceMember> workspaceMembers,
            Long workspaceId
    ) {
        return workspaceMembers.stream()
                .filter(
                        workspaceMember -> workspaceMember.getWorkspaceId()
                                .equals(workspaceId)
                )
                .findFirst()
                .orElseThrow(() -> new WorkspaceException(WorkspaceErrorCode.WORKSPACE_NOT_FOUND));
    }

    private void validateWorkspaceId(Long workspaceId) {
        if (workspaceId == null || workspaceId <= 0) {
            throw new WorkspaceException(WorkspaceErrorCode.INVALID_WORKSPACE_ID);
        }
    }
}
