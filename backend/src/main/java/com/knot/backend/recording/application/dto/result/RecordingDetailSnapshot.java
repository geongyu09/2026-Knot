package com.knot.backend.recording.application.dto.result;

import com.knot.backend.recording.domain.RecordingAudioUploadStatus;
import com.knot.backend.recording.domain.RecordingEndReason;
import com.knot.backend.recording.domain.RecordingStatus;
import java.time.Instant;

public record RecordingDetailSnapshot(
        long memberId,
        RecordingStatus status,
        Instant currentIntervalStartedAt,
        long accumulatedRecordingMillis,
        Instant endedAt,
        RecordingEndReason endReason,
        RecordingAudioUploadStatus audioUploadStatus
) {
}
