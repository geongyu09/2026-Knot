package com.knot.backend.recording.application;

import com.knot.backend.recording.application.dto.command.RecordingControlCommand;
import com.knot.backend.recording.application.dto.result.RecordingEndResult;
import com.knot.backend.recording.domain.RecordingSession;
import com.knot.backend.recording.domain.RecordingSessionRepository;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class RecordingEndService {
    private final RecordingControlledSessionLoader controlledSessionLoader;
    private final RecordingSessionRepository recordingSessionRepository;
    private final Clock clock;

    @Transactional
    public RecordingEndResult end(
            long workspaceId,
            long memberId,
            long recordingId,
            RecordingControlCommand command
    ) {
        RecordingSession session = controlledSessionLoader.loadForUpdate(
                workspaceId,
                memberId,
                recordingId,
                command
        );
        session.end(
                clock.instant()
                        .truncatedTo(ChronoUnit.MICROS)
        );
        return RecordingEndResult.from(recordingSessionRepository.save(session));
    }
}
