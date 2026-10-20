package com.knot.backend.recording.application.dto.result;

import com.knot.backend.recording.domain.model.RecordingSession;
import java.time.Instant;

public record RecordingCurrentResult(
        long recordingId,
        CurrentRecordingStatus status,
        Instant startedAt,
        long elapsedMillis
) {

    public static RecordingCurrentResult of(
            RecordingSession session,
            CurrentRecordingStatus status,
            Instant now
    ) {
        return new RecordingCurrentResult(
                session.getId(),
                status,
                session.getStartedAt(),
                session.getRecordingDurationMillis(now)
        );
    }
}
