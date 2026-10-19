package com.knot.backend.workspace.application;

public interface WorkspaceInvitationSecretHasher {

    String hash(
            WorkspaceInvitationSecretKind kind,
            String secret
    );
}
