package com.knot.backend.workspace.application;

import com.knot.backend.document.application.DocumentArchivalService;
import com.knot.backend.recording.domain.model.RecordingSession;
import com.knot.backend.recording.domain.repository.RecordingSessionRepository;
import com.knot.backend.workspace.application.dto.result.WorkspaceOwnershipTransferCandidateResult;
import com.knot.backend.workspace.domain.model.Workspace;
import com.knot.backend.workspace.domain.WorkspaceErrorCode;
import com.knot.backend.workspace.domain.WorkspaceException;
import com.knot.backend.workspace.domain.model.WorkspaceMember;
import com.knot.backend.workspace.domain.repository.WorkspaceMemberRepository;
import com.knot.backend.workspace.domain.model.WorkspaceMemberRole;
import com.knot.backend.workspace.domain.repository.WorkspaceRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class WorkspaceLeaveService {
    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final WorkspaceOwnershipTransferCandidateQuery candidateQuery;
    private final RecordingSessionRepository recordingSessionRepository;
    private final DocumentArchivalService documentArchivalService;
    private final Clock clock;

    @Transactional
    public void leave(
            long memberId,
            Long workspaceId
    ) {
        Workspace workspace = lockWorkspace(workspaceId);
        WorkspaceMember actor = workspaceMemberRepository.findLatestByWorkspaceIdAndMemberIdForUpdate(
                workspaceId,
                memberId
        )
                .orElseThrow(() -> new WorkspaceException(WorkspaceErrorCode.WORKSPACE_ACCESS_DENIED));
        if (!actor.isActive()) {
            return;
        }
        Instant leftAt = now();
        workspace.removeMember(
                actor,
                workspaceMemberRepository.countActiveByWorkspaceId(workspaceId),
                leftAt
        );
        workspaceRepository.save(workspace);
        workspaceMemberRepository.save(actor);
        completeDeparture(
                workspaceId,
                memberId,
                findRecordingsToDiscard(
                        workspace,
                        workspaceId,
                        memberId
                ),
                leftAt
        );
    }

    @Transactional
    public void transferOwnership(
            long memberId,
            Long workspaceId,
            long successorMemberId
    ) {
        lockWorkspace(workspaceId);
        List<WorkspaceMember> participants = workspaceMemberRepository.findAllActiveByWorkspaceIdAndMemberIdsForUpdate(
                workspaceId,
                List.of(
                        memberId,
                        successorMemberId
                )
        );
        WorkspaceMember owner = findOwner(
                participants,
                memberId
        );
        WorkspaceMember successor = findSuccessor(
                participants,
                successorMemberId
        );
        Instant leftAt = now();
        owner.transferOwnershipTo(
                successor,
                leftAt
        );
        workspaceMemberRepository.saveAll(
                List.of(
                        owner,
                        successor
                )
        );
        completeDeparture(
                workspaceId,
                memberId,
                recordingSessionRepository.findAllActiveByWorkspaceIdAndMemberIdForUpdate(
                        workspaceId,
                        memberId
                ),
                leftAt
        );
    }

    @Transactional(readOnly = true)
    public List<WorkspaceOwnershipTransferCandidateResult> findOwnershipTransferCandidates(
            Long workspaceId,
            long memberId
    ) {
        validateWorkspaceId(workspaceId);
        workspaceRepository.findById(workspaceId)
                .orElseThrow(() -> new WorkspaceException(WorkspaceErrorCode.WORKSPACE_NOT_FOUND));
        if (!workspaceMemberRepository.existsByWorkspaceIdAndMemberIdAndRole(
                workspaceId,
                memberId,
                WorkspaceMemberRole.OWNER
        )) {
            throw new WorkspaceException(WorkspaceErrorCode.WORKSPACE_OWNER_REQUIRED);
        }
        return candidateQuery.findAll(
                workspaceId,
                memberId
        );
    }

    private Workspace lockWorkspace(Long workspaceId) {
        validateWorkspaceId(workspaceId);
        return workspaceRepository.findByIdForUpdate(workspaceId)
                .orElseThrow(() -> new WorkspaceException(WorkspaceErrorCode.WORKSPACE_NOT_FOUND));
    }

    private WorkspaceMember findOwner(
            List<WorkspaceMember> participants,
            long memberId
    ) {
        return participants.stream()
                .filter(participant -> participant.getMemberId() == memberId)
                .filter(WorkspaceMember::isOwner)
                .findFirst()
                .orElseThrow(() -> new WorkspaceException(WorkspaceErrorCode.WORKSPACE_OWNER_REQUIRED));
    }

    private WorkspaceMember findSuccessor(
            List<WorkspaceMember> participants,
            long successorMemberId
    ) {
        return participants.stream()
                .filter(participant -> participant.getMemberId() == successorMemberId)
                .findFirst()
                .orElseThrow(
                        () -> new WorkspaceException(WorkspaceErrorCode.WORKSPACE_OWNERSHIP_TRANSFER_TARGET_CONFLICT)
                );
    }

    private List<RecordingSession> findRecordingsToDiscard(
            Workspace workspace,
            long workspaceId,
            long memberId
    ) {
        if (workspace.isDeleted()) {
            return recordingSessionRepository.findAllActiveByWorkspaceIdForUpdate(workspaceId);
        }
        return recordingSessionRepository.findAllActiveByWorkspaceIdAndMemberIdForUpdate(
                workspaceId,
                memberId
        );
    }

    private void completeDeparture(
            long workspaceId,
            long memberId,
            List<RecordingSession> recordingsToDiscard,
            Instant leftAt
    ) {
        for (RecordingSession recording : recordingsToDiscard) {
            recording.discard(leftAt);
            recordingSessionRepository.save(recording);
        }
        workspaceMemberRepository.flush();
        documentArchivalService.archiveAfterMemberDeparture(
                workspaceId,
                memberId,
                leftAt
        );
    }

    private void validateWorkspaceId(Long workspaceId) {
        if (workspaceId == null || workspaceId <= 0) {
            throw new WorkspaceException(WorkspaceErrorCode.INVALID_WORKSPACE_ID);
        }
    }

    private Instant now() {
        return clock.instant()
                .truncatedTo(ChronoUnit.MICROS);
    }
}
