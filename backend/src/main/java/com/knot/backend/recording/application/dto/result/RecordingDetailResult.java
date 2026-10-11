package com.knot.backend.recording.application.dto.result;

import com.knot.backend.recording.domain.RecordingAudioUploadStatus;
import com.knot.backend.recording.domain.RecordingEndReason;
import com.knot.backend.recording.domain.RecordingStatus;
import java.time.Duration;
import java.time.Instant;

public record RecordingDetailResult(
        RecordingStatus status,
        long elapsedMillis,
        Instant endedAt,
        RecordingEndReason endReason,
        RecordingAudioUploadStatus audioUploadStatus
) {

    public static RecordingDetailResult of(
            RecordingDetailSnapshot snapshot,
            Instant serverNow
    ) {
        return new RecordingDetailResult(
                snapshot.status(),
                elapsedMillis(
                        snapshot,
                        serverNow
                ),
                snapshot.endedAt(),
                snapshot.endReason(),
                snapshot.audioUploadStatus()
        );
    }

    private static long elapsedMillis(
            RecordingDetailSnapshot snapshot,
            Instant serverNow
    ) {
        if (snapshot.status() != RecordingStatus.RECORDING) {
            return snapshot.accumulatedRecordingMillis();
        }
        long currentIntervalMillis = Duration.between(
                snapshot.currentIntervalStartedAt(),
                serverNow
        )
                .toMillis();
        return snapshot.accumulatedRecordingMillis() + Math.max(
                0L,
                currentIntervalMillis
        );
    }
}
