package com.knot.backend.recording.application.dto.result;

import java.util.UUID;

public record TranscriptionWindowClaim(
        long recordingId,
        long windowId,
        UUID attemptId,
        UUID ownerToken,
        long claimEpoch,
        String manifestJson,
        String manifestSha256
) {
}
