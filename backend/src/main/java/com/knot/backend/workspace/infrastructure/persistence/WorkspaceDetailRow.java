package com.knot.backend.workspace.infrastructure.persistence;

record WorkspaceDetailRow(
        String name,
        String myRole,
        long activeMemberCount
) {
}
