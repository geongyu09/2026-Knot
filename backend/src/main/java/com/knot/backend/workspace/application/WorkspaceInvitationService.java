package com.knot.backend.workspace.application;

import com.knot.backend.workspace.application.dto.result.WorkspaceInvitationAcceptanceResult;
import com.knot.backend.workspace.application.dto.result.WorkspaceInvitationPreviewResult;
import com.knot.backend.workspace.application.dto.result.WorkspaceInvitationResult;
import com.knot.backend.workspace.application.dto.result.WorkspaceInvitationSecrets;
import com.knot.backend.workspace.domain.Workspace;
import com.knot.backend.workspace.domain.WorkspaceErrorCode;
import com.knot.backend.workspace.domain.WorkspaceException;
import com.knot.backend.workspace.domain.WorkspaceInvitation;
import com.knot.backend.workspace.domain.WorkspaceInvitationRepository;
import com.knot.backend.workspace.domain.WorkspaceInvitationSecretCollisionException;
import com.knot.backend.workspace.domain.WorkspaceMember;
import com.knot.backend.workspace.domain.WorkspaceMemberRepository;
import com.knot.backend.workspace.domain.WorkspaceRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.function.Supplier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WorkspaceInvitationService {
    static final int MAX_SECRET_GENERATION_ATTEMPTS = 3;

    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final WorkspaceInvitationRepository workspaceInvitationRepository;
    private final WorkspaceInvitationSecretGenerator secretGenerator;
    private final WorkspaceInvitationSecretProtector secretProtector;
    private final WorkspaceInvitationPreviewRateLimiter previewRateLimiter;
    private final WorkspaceInvitationTransactionExecutor transactionExecutor;
    private final Clock clock;

    public WorkspaceInvitationService(
            WorkspaceRepository workspaceRepository,
            WorkspaceMemberRepository workspaceMemberRepository,
            WorkspaceInvitationRepository workspaceInvitationRepository,
            WorkspaceInvitationSecretGenerator secretGenerator,
            WorkspaceInvitationSecretProtector secretProtector,
            WorkspaceInvitationPreviewRateLimiter previewRateLimiter,
            WorkspaceInvitationTransactionExecutor transactionExecutor,
            Clock clock
    ) {
        this.workspaceRepository = workspaceRepository;
        this.workspaceMemberRepository = workspaceMemberRepository;
        this.workspaceInvitationRepository = workspaceInvitationRepository;
        this.secretGenerator = secretGenerator;
        this.secretProtector = secretProtector;
        this.previewRateLimiter = previewRateLimiter;
        this.transactionExecutor = transactionExecutor;
        this.clock = clock;
    }

    public WorkspaceInvitationResult issue(
            Long workspaceId,
            long memberId
    ) {
        return executeWithSecretCollisionRetry(
                () -> issueInTransaction(
                        workspaceId,
                        memberId
                )
        );
    }

    @Transactional(readOnly = true)
    public WorkspaceInvitationPreviewResult preview(
            String tokenOrCode,
            String remoteAddress
    ) {
        WorkspaceInvitation invitation = findInvitation(
                tokenOrCode,
                remoteAddress
        );
        invitation.validateUsableAt(currentTime());
        Workspace workspace = workspaceRepository.findById(invitation.getWorkspaceId())
                .orElseThrow(this::invitationNotFound);
        return new WorkspaceInvitationPreviewResult(
                invitation.getWorkspaceId(),
                workspace.getName()
        );
    }

    @Transactional
    public WorkspaceInvitationAcceptanceResult accept(
            String tokenOrCode,
            String remoteAddress,
            long memberId
    ) {
        WorkspaceInvitation invitation = findInvitation(
                tokenOrCode,
                remoteAddress
        );
        Workspace workspace = workspaceRepository.findByIdForUpdate(invitation.getWorkspaceId())
                .orElseThrow(this::invitationNotFound);
        boolean created = joinIfAbsent(
                invitation.admit(
                        memberId,
                        currentTime()
                )
        );
        return new WorkspaceInvitationAcceptanceResult(
                invitation.getWorkspaceId(),
                workspace.getName(),
                created
        );
    }

    private WorkspaceInvitationResult issueInTransaction(
            Long workspaceId,
            long memberId
    ) {
        validateWorkspaceId(workspaceId);
        workspaceRepository.findByIdForUpdate(workspaceId)
                .orElseThrow(() -> new WorkspaceException(WorkspaceErrorCode.WORKSPACE_NOT_FOUND));
        if (!workspaceMemberRepository.existsByWorkspaceIdAndMemberId(
                workspaceId,
                memberId
        )) {
            throw new WorkspaceException(WorkspaceErrorCode.WORKSPACE_ACCESS_DENIED);
        }
        WorkspaceInvitationSecrets secrets = secretGenerator.generate();
        WorkspaceInvitation invitation = workspaceInvitationRepository.save(
                WorkspaceInvitation.create(
                        workspaceId,
                        secretProtector.hash(
                                WorkspaceInvitationSecretKind.LINK_TOKEN,
                                secrets.linkToken()
                        ),
                        secretProtector.hash(
                                WorkspaceInvitationSecretKind.INVITE_CODE,
                                secrets.code()
                        ),
                        currentTime()
                )
        );
        return new WorkspaceInvitationResult(
                secrets.code(),
                secrets.linkToken(),
                invitation.getExpiresAt()
        );
    }

    private WorkspaceInvitationResult executeWithSecretCollisionRetry(Supplier<WorkspaceInvitationResult> operation) {
        WorkspaceInvitationSecretCollisionException lastCollision = null;
        for (int attempt = 0; attempt < MAX_SECRET_GENERATION_ATTEMPTS; attempt++) {
            try {
                return transactionExecutor.execute(operation);
            } catch (WorkspaceInvitationSecretCollisionException exception) {
                lastCollision = exception;
            }
        }
        throw lastCollision;
    }

    private WorkspaceInvitation findInvitation(
            String tokenOrCode,
            String remoteAddress
    ) {
        WorkspaceInvitationCredential credential = WorkspaceInvitationCredential.from(tokenOrCode);
        if (credential.rateLimited()) {
            previewRateLimiter.consume(remoteAddress);
            credential.validate();
        }
        String secretHash = secretProtector.hash(
                credential.kind(),
                credential.secret()
        );
        return findBySecretHash(
                credential.kind(),
                secretHash
        ).orElseThrow(this::invitationNotFound);
    }

    private Optional<WorkspaceInvitation> findBySecretHash(
            WorkspaceInvitationSecretKind kind,
            String secretHash
    ) {
        if (kind == WorkspaceInvitationSecretKind.INVITE_CODE) {
            return workspaceInvitationRepository.findByInviteCodeHash(secretHash);
        }
        return workspaceInvitationRepository.findByLinkTokenHash(secretHash);
    }

    private boolean joinIfAbsent(WorkspaceMember newMember) {
        if (workspaceMemberRepository.existsByWorkspaceIdAndMemberId(
                newMember.getWorkspaceId(),
                newMember.getMemberId()
        )) {
            return false;
        }
        workspaceMemberRepository.save(newMember);
        return true;
    }

    private void validateWorkspaceId(Long workspaceId) {
        if (workspaceId == null || workspaceId <= 0) {
            throw new WorkspaceException(WorkspaceErrorCode.INVALID_WORKSPACE_ID);
        }
    }

    private Instant currentTime() {
        return Instant.now(clock)
                .truncatedTo(ChronoUnit.MICROS);
    }

    private WorkspaceException invitationNotFound() {
        return new WorkspaceException(WorkspaceErrorCode.WORKSPACE_INVITATION_PREVIEW_NOT_FOUND);
    }
}
