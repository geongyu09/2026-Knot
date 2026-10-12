package com.knot.backend.global.exception;

import com.knot.backend.workspace.domain.WorkspaceErrorCode;

final class RateLimitedProjectException extends ProjectException implements RetryAfterException {

    private final long retryAfterSeconds;

    RateLimitedProjectException(long retryAfterSeconds) {
        super(WorkspaceErrorCode.WORKSPACE_INVITATION_PREVIEW_RATE_LIMIT_EXCEEDED);
        this.retryAfterSeconds = retryAfterSeconds;
    }

    @Override
    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}
