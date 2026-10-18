package com.knot.backend.workspace.infrastructure.persistence;

import com.knot.backend.workspace.domain.model.WorkspaceInvitation;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

interface WorkspaceInvitationJpaRepository extends JpaRepository<WorkspaceInvitation, Long> {

    Optional<WorkspaceInvitation> findByLinkTokenHash(String linkTokenHash);

    Optional<WorkspaceInvitation> findByInviteCodeHash(String inviteCodeHash);
}
