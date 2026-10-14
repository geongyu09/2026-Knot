package com.knot.backend.recording.application;

import com.knot.backend.recording.application.dto.result.RecordingDetailResult;
import com.knot.backend.recording.application.dto.result.RecordingDetailSnapshot;
import com.knot.backend.recording.domain.RecordingErrorCode;
import com.knot.backend.recording.domain.RecordingException;
import com.knot.backend.document.application.DocumentGenerationProgressService;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;

@Service
@RequiredArgsConstructor
public class RecordingDetailService {
    private final RecordingWorkspaceAccessValidator workspaceAccessValidator;
    private final RecordingDetailQuery recordingDetailQuery;
    private final RecordingTranscriptionStateService transcriptionState;
    private final DocumentGenerationProgressService documentProgress;
    private final Clock clock;

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public RecordingDetailResult find(
            long workspaceId,
            long memberId,
            long recordingId
    ) {
        workspaceAccessValidator.validate(
                workspaceId,
                memberId
        );
        if (recordingId <= 0) {
            throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_DATA);
        }
        RecordingDetailSnapshot snapshot = recordingDetailQuery.find(
                workspaceId,
                recordingId
        )
                .orElseThrow(() -> new RecordingException(RecordingErrorCode.RECORDING_NOT_FOUND));
        if (snapshot.memberId() != memberId) {
            throw new RecordingException(RecordingErrorCode.RECORDING_CONTROL_DENIED);
        }
        Instant now = clock.instant()
                .truncatedTo(ChronoUnit.MICROS);
        return RecordingDetailResult.of(
                snapshot,
                transcriptionState.find(recordingId),
                documentProgress.findSummary(
                        workspaceId,
                        recordingId,
                        now
                )
                        .orElse(null),
                now
        );
    }
}
