package com.knot.backend.recording.application;

import com.knot.backend.recording.application.dto.command.RecordingControlCommand;
import com.knot.backend.recording.application.dto.result.RecordingEndResult;
import com.knot.backend.recording.application.dto.result.RecordingHeartbeatResult;
import com.knot.backend.recording.application.dto.result.RecordingPauseResult;
import com.knot.backend.recording.application.dto.result.RecordingResumeResult;
import com.knot.backend.recording.domain.RecordingException;
import com.knot.backend.recording.domain.RecordingSession;
import com.knot.backend.recording.domain.RecordingSessionRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class RecordingControlService {
    private final RecordingControlledSessionLoader controlledSessionLoader;
    private final RecordingSessionRepository recordingSessionRepository;
    private final Clock clock;

    // 만료된 녹음은 만료 종료를 커밋한 뒤 409로 응답해야 하므로 도메인 예외로 롤백하지 않는다.
    @Transactional(noRollbackFor = RecordingException.class)
    public RecordingPauseResult pause(
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
        session.pause(now());
        return RecordingPauseResult.from(recordingSessionRepository.save(session));
    }

    // 만료된 녹음은 만료 종료를 커밋한 뒤 409로 응답해야 하므로 도메인 예외로 롤백하지 않는다.
    @Transactional(noRollbackFor = RecordingException.class)
    public RecordingResumeResult resume(
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
        session.resume(now());
        return RecordingResumeResult.from(recordingSessionRepository.save(session));
    }

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
        session.end(now());
        return RecordingEndResult.from(recordingSessionRepository.save(session));
    }

    @Transactional
    public RecordingHeartbeatResult heartbeat(
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
        Instant now = now();
        session.recordHeartbeat(now);
        return RecordingHeartbeatResult.of(
                recordingSessionRepository.save(session),
                now
        );
    }

    private Instant now() {
        return clock.instant()
                .truncatedTo(ChronoUnit.MICROS);
    }
}
