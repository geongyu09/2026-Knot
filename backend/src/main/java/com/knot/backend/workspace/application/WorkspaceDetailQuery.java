package com.knot.backend.workspace.application;

import com.knot.backend.workspace.application.dto.result.WorkspaceDetailResult;
import java.util.Optional;

public interface WorkspaceDetailQuery {

    Optional<WorkspaceDetailResult> find(
            long workspaceId,
            long memberId
    );
}
