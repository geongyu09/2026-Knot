package com.knot.backend.recording.application;

import com.knot.backend.document.application.DocumentGenerationIntakeService;
import com.knot.backend.recording.application.dto.result.AiTranscript;
import com.knot.backend.recording.application.dto.result.RecordingTranscriptionExecution;
import com.knot.backend.recording.application.dto.result.RecordingTranscriptionRetryResult;
import com.knot.backend.recording.application.dto.result.RecordingTranscriptionSnapshot;
import com.knot.backend.recording.domain.RecordingAudioUpload;
import com.knot.backend.recording.domain.RecordingAudioUploadRepository;
import com.knot.backend.recording.domain.RecordingErrorCode;
import com.knot.backend.recording.domain.RecordingException;
import com.knot.backend.recording.domain.RecordingSession;
import com.knot.backend.recording.domain.RecordingSessionRepository;
import com.knot.backend.recording.domain.RecordingStatus;
import com.knot.backend.recording.domain.RecordingTranscription;
import com.knot.backend.recording.domain.RecordingTranscriptionRepository;
import com.knot.backend.recording.domain.Transcript;
import com.knot.backend.recording.domain.TranscriptRepository;
import com.knot.backend.recording.domain.TranscriptSegment;
import com.knot.backend.recording.domain.TranscriptSegmentRepository;
import com.knot.backend.recording.domain.TranscriptionStatus;
import com.knot.backend.workspace.domain.WorkspaceRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class RecordingTranscriptionStateService {
    private final RecordingWorkspaceAccessValidator access;
    private final WorkspaceRepository workspaces;
    private final RecordingSessionRepository recordings;
    private final RecordingAudioUploadRepository uploads;
    private final RecordingTranscriptionRepository transcriptions;
    private final TranscriptRepository transcripts;
    private final TranscriptSegmentRepository segments;
    private final DocumentGenerationIntakeService documentIntake;
    private final Clock clock;

    @Transactional(propagation = Propagation.MANDATORY)
    public void registerAutomatic(long recordingId) {
        if (transcriptions.findByRecordingSessionId(recordingId)
                .isPresent()) {
            return;
        }
        transcriptions.lockAdmission();
        Instant now = now();
        RecordingTranscription transcription = RecordingTranscription.processing(
                recordingId,
                UUID.randomUUID(),
                now
        );
        if (transcriptions.findProcessing()
                .isPresent()) {
            transcription.fail(
                    transcription.getAttemptId(),
                    "BUSY",
                    now
            );
        }
        transcriptions.saveAndFlush(transcription);
    }

    @Transactional
    public RecordingTranscriptionRetryResult retry(
            long workspaceId,
            long memberId,
            long recordingId
    ) {
        access.validateAndLock(
                workspaceId,
                memberId
        );
        RecordingSession recording = recordings.findByIdForUpdate(recordingId)
                .orElseThrow(() -> new RecordingException(RecordingErrorCode.RECORDING_NOT_FOUND));
        recording.validateControlledBy(
                workspaceId,
                memberId
        );
        recording.validateEnded();
        RecordingAudioUpload upload = uploads.findByRecordingId(recordingId)
                .orElseThrow(() -> new RecordingException(RecordingErrorCode.AUDIO_UPLOAD_NOT_FOUND));
        validateUpload(upload);
        RecordingTranscription transcription = transcriptions.findByRecordingSessionIdForUpdate(recordingId)
                .orElseThrow(() -> new RecordingException(RecordingErrorCode.TRANSCRIPTION_RETRY_NOT_ALLOWED));
        if (transcription.getStatus() != TranscriptionStatus.FAILED) {
            throw new RecordingException(RecordingErrorCode.TRANSCRIPTION_RETRY_NOT_ALLOWED);
        }
        transcriptions.lockAdmission();
        if (transcriptions.findProcessing()
                .isPresent()) {
            throw new RecordingException(RecordingErrorCode.TRANSCRIPTION_BUSY);
        }
        transcription.retry(
                UUID.randomUUID(),
                now()
        );
        return new RecordingTranscriptionRetryResult(
                recordingId,
                transcription.getAttemptId(),
                transcription.getStatus()
        );
    }

    @Transactional(readOnly = true)
    public Optional<RecordingTranscriptionExecution> findProcessing() {
        return transcriptions.findProcessing()
                .map(this::execution);
    }

    @Transactional(readOnly = true)
    public RecordingTranscriptionSnapshot find(long recordingId) {
        return transcriptions.findByRecordingSessionId(recordingId)
                .map(
                        value -> new RecordingTranscriptionSnapshot(
                                value.getAttemptId(),
                                value.getStatus(),
                                value.getFailureCode()
                        )
                )
                .orElse(null);
    }

    @Transactional
    public void complete(
            RecordingTranscriptionExecution execution,
            AiTranscript result
    ) {
        boolean workspaceAvailable = workspaces.findByIdForUpdate(execution.workspaceId())
                .isPresent();
        Optional<RecordingSession> recording = recordings.findByIdForUpdate(execution.recordingId());
        Optional<RecordingTranscription> found = transcriptions
                .findByRecordingSessionIdForUpdate(execution.recordingId());
        if (found.isEmpty() || !found.orElseThrow()
                .isProcessing(execution.attemptId())) {
            return;
        }
        RecordingTranscription transcription = found.orElseThrow();
        if (!workspaceAvailable || recording.isEmpty() || !recording.orElseThrow()
                .belongsTo(execution.workspaceId())
                || recording.orElseThrow()
                        .getStatus() != RecordingStatus.ENDED
                || !hasAvailableUpload(execution.recordingId())) {
            transcription.fail(
                    execution.attemptId(),
                    "RECORDING_UNAVAILABLE",
                    now()
            );
            return;
        }
        validateTranscript(result);
        Instant now = now();
        Transcript transcript = transcripts.saveAndFlush(
                Transcript.create(
                        execution.recordingId(),
                        result.rawWhisperJson(),
                        now
                )
        );
        segments.saveAll(
                toSegments(
                        transcript.getId(),
                        result
                )
        );
        documentIntake.acceptCompletedTranscript(
                execution.workspaceId(),
                execution.recordingId(),
                transcript.getId()
        );
        transcription.succeed(
                execution.attemptId(),
                now
        );
    }

    @Transactional
    public void fail(
            RecordingTranscriptionExecution execution,
            String failureCode
    ) {
        // Workspace -> recording -> transcription is also the completion/deletion lock
        // order.
        workspaces.findIncludingDeletedByIdForUpdate(execution.workspaceId());
        recordings.findByIdForUpdate(execution.recordingId());
        transcriptions.findByRecordingSessionIdForUpdate(execution.recordingId())
                .ifPresent(
                        value -> value.fail(
                                execution.attemptId(),
                                failureCode,
                                now()
                        )
                );
    }

    @Transactional
    public void recoverProcessing() {
        transcriptions.findProcessing()
                .ifPresent(
                        value -> fail(
                                execution(value),
                                "SERVER_RESTARTED"
                        )
                );
    }

    private RecordingTranscriptionExecution execution(RecordingTranscription transcription) {
        RecordingSession recording = recordings.findById(transcription.getRecordingSessionId())
                .orElseThrow(() -> new RecordingException(RecordingErrorCode.RECORDING_NOT_FOUND));
        RecordingAudioUpload upload = uploads.findByRecordingId(recording.getId())
                .orElseThrow(() -> new RecordingException(RecordingErrorCode.AUDIO_UPLOAD_NOT_FOUND));
        return new RecordingTranscriptionExecution(
                recording.getWorkspaceId(),
                recording.getId(),
                transcription.getAttemptId(),
                upload.getStorageKey(),
                upload.getContentType(),
                upload.getContentLength(),
                transcription.getStartedAt()
        );
    }

    private void validateUpload(RecordingAudioUpload upload) {
        if (!upload.isCompleted() || upload.getDeletedAt() != null) {
            throw new RecordingException(RecordingErrorCode.AUDIO_UPLOAD_NOT_COMPLETED);
        }
    }

    private boolean hasAvailableUpload(long recordingId) {
        return uploads.findByRecordingId(recordingId)
                .filter(value -> value.isCompleted() && value.getDeletedAt() == null)
                .isPresent();
    }

    private void validateTranscript(AiTranscript result) {
        // HTTP에서는 JSON을 매핑하고 결과 값은 저장 전에 한 번 검사한다.
        if (result == null || result.schemaVersion() != 1 || result.rawWhisperJson() == null || result.rawWhisperJson()
                .isBlank() || result.utterances()
                        .isEmpty()) {
            throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_DATA);
        }
        double previousStart = -1;
        for (int index = 0; index < result.utterances()
                .size(); index++) {
            AiTranscript.Utterance utterance = result.utterances()
                    .get(index);
            if (utterance.ord() != index || !Double.isFinite(utterance.startSec())
                    || !Double.isFinite(utterance.endSec()) || utterance.startSec() < 0 || utterance.endSec() > 7200
                    || utterance.startSec() < previousStart || utterance.endSec() < utterance.startSec()) {
                throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_DATA);
            }
            previousStart = utterance.startSec();
        }
    }

    private List<TranscriptSegment> toSegments(
            long transcriptId,
            AiTranscript result
    ) {
        Map<String, Integer> speakerNumbers = new HashMap<>();
        return IntStream.range(
                0,
                result.utterances()
                        .size()
        )
                .mapToObj(index -> {
                    AiTranscript.Utterance utterance = result.utterances()
                            .get(index);
                    Integer speakerNumber = null;
                    if (utterance.speakerLabel() != null && !utterance.speakerLabel()
                            .isBlank()) {
                        speakerNumber = speakerNumbers.computeIfAbsent(
                                utterance.speakerLabel(),
                                ignored -> speakerNumbers.size() + 1
                        );
                    }
                    return TranscriptSegment.create(
                            transcriptId,
                            index,
                            Math.round(utterance.startSec() * 1000),
                            Math.round(utterance.endSec() * 1000),
                            speakerNumber,
                            utterance.text()
                    );
                })
                .toList();
    }

    private Instant now() {
        return clock.instant()
                .truncatedTo(ChronoUnit.MICROS);
    }
}
