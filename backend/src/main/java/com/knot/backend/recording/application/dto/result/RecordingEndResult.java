package com.knot.backend.recording.application.dto.result;

import com.knot.backend.recording.domain.model.RecordingSession;
import com.knot.backend.recording.domain.model.RecordingStatus;
import java.time.Instant;

public record RecordingEndResult(
        long recordingId,
        RecordingStatus status,
        Instant endedAt
) {

    public static RecordingEndResult from(RecordingSession session) {
        return new RecordingEndResult(
                session.getId(),
                session.getStatus(),
                session.getEndedAt()
        );
    }
}
