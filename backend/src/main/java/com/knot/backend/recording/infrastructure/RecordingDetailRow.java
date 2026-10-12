package com.knot.backend.recording.infrastructure;

import com.knot.backend.recording.domain.RecordingAudioUploadStatus;
import com.knot.backend.recording.domain.RecordingEndReason;
import com.knot.backend.recording.domain.RecordingStatus;
import java.time.Instant;

record RecordingDetailRow(
        long memberId,
        RecordingStatus status,
        Instant currentIntervalStartedAt,
        long accumulatedRecordingMillis,
        Instant endedAt,
        RecordingEndReason endReason,
        RecordingAudioUploadStatus audioUploadStatus
) {
}
