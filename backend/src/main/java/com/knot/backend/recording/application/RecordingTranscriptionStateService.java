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
import com.knot.backend.recording.domain.RecordingTranscription;
import com.knot.backend.recording.domain.RecordingTranscriptionRepository;
import com.knot.backend.recording.domain.Transcript;
import com.knot.backend.recording.domain.TranscriptRepository;
import com.knot.backend.recording.domain.TranscriptSegment;
import com.knot.backend.recording.domain.TranscriptSegmentRepository;
import com.knot.backend.recording.domain.TranscriptUtterance;
import com.knot.backend.workspace.domain.WorkspaceRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class RecordingTranscriptionStateService {
    private final RecordingAccess recordingAccess;
    private final WorkspaceRepository workspaceRepository;
    private final RecordingSessionRepository recordingSessionRepository;
    private final RecordingAudioUploadRepository recordingAudioUploadRepository;
    private final RecordingTranscriptionRepository recordingTranscriptionRepository;
    private final TranscriptRepository transcriptRepository;
    private final TranscriptSegmentRepository transcriptSegmentRepository;
    private final DocumentGenerationIntakeService documentGenerationIntakeService;
    private final Clock clock;

    @Transactional(propagation = Propagation.MANDATORY)
    public void registerAutomatic(long recordingId) {
        if (recordingTranscriptionRepository.findByRecordingSessionId(recordingId)
                .isPresent()) {
            return;
        }
        recordingTranscriptionRepository.lockAdmission();
        Instant now = now();
        RecordingTranscription transcription = RecordingTranscription.processing(
                recordingId,
                UUID.randomUUID(),
                now
        );
        if (recordingTranscriptionRepository.findProcessing()
                .isPresent()) {
            transcription.fail(
                    transcription.getAttemptId(),
                    "BUSY"
            );
        }
        recordingTranscriptionRepository.saveAndFlush(transcription);
    }

    @Transactional
    public RecordingTranscriptionRetryResult retry(
            long workspaceId,
            long memberId,
            long recordingId
    ) {
        recordingAccess.loadOwnedForUpdate(
                workspaceId,
                memberId,
                recordingId
        )
                .validateEnded();
        RecordingAudioUpload upload = recordingAudioUploadRepository.findByRecordingId(recordingId)
                .orElseThrow(() -> new RecordingException(RecordingErrorCode.AUDIO_UPLOAD_NOT_FOUND));
        upload.validateAudioAvailable();
        RecordingTranscription transcription = recordingTranscriptionRepository
                .findByRecordingSessionIdForUpdate(recordingId)
                .orElseThrow(() -> new RecordingException(RecordingErrorCode.TRANSCRIPTION_RETRY_NOT_ALLOWED));
        transcription.validateRetryable();
        recordingTranscriptionRepository.lockAdmission();
        if (recordingTranscriptionRepository.findProcessing()
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
        return recordingTranscriptionRepository.findProcessing()
                .map(this::createExecutionContext);
    }

    @Transactional(readOnly = true)
    public RecordingTranscriptionSnapshot findSnapshot(long recordingId) {
        return recordingTranscriptionRepository.findByRecordingSessionId(recordingId)
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
            RecordingTranscriptionExecution executionContext,
            AiTranscript result
    ) {
        boolean workspaceAvailable = workspaceRepository.findByIdForUpdate(executionContext.workspaceId())
                .isPresent();
        boolean recordingAvailable = recordingSessionRepository.findByIdForUpdate(executionContext.recordingId())
                .filter(value -> value.isTranscribableIn(executionContext.workspaceId()))
                .isPresent();
        Optional<RecordingTranscription> processingAttempt = recordingTranscriptionRepository
                .findByRecordingSessionIdForUpdate(executionContext.recordingId())
                .filter(value -> value.isProcessingAttempt(executionContext.attemptId()));
        if (processingAttempt.isEmpty()) {
            return;
        }
        RecordingTranscription transcription = processingAttempt.orElseThrow();
        if (!workspaceAvailable || !recordingAvailable || !hasAvailableUpload(executionContext.recordingId())) {
            transcription.fail(
                    executionContext.attemptId(),
                    "RECORDING_UNAVAILABLE"
            );
            return;
        }
        List<TranscriptUtterance> utterances = result.toUtterances();
        Transcript transcript = transcriptRepository.saveAndFlush(
                Transcript.create(
                        executionContext.recordingId(),
                        result.rawWhisperJson(),
                        now()
                )
        );
        transcriptSegmentRepository.saveAll(
                TranscriptSegment.createAll(
                        transcript.getId(),
                        utterances
                )
        );
        documentGenerationIntakeService.acceptCompletedTranscript(
                executionContext.workspaceId(),
                executionContext.recordingId(),
                transcript.getId()
        );
        transcription.succeed(executionContext.attemptId());
    }

    @Transactional
    public void fail(
            RecordingTranscriptionExecution executionContext,
            String failureCode
    ) {
        workspaceRepository.findIncludingDeletedByIdForUpdate(executionContext.workspaceId());
        recordingSessionRepository.findByIdForUpdate(executionContext.recordingId());
        recordingTranscriptionRepository.findByRecordingSessionIdForUpdate(executionContext.recordingId())
                .ifPresent(
                        value -> value.fail(
                                executionContext.attemptId(),
                                failureCode
                        )
                );
    }

    @Transactional
    public void recoverProcessing() {
        recordingTranscriptionRepository.findProcessing()
                .ifPresent(
                        value -> fail(
                                createExecutionContext(value),
                                "SERVER_RESTARTED"
                        )
                );
    }

    private RecordingTranscriptionExecution createExecutionContext(RecordingTranscription transcription) {
        RecordingSession recording = recordingSessionRepository.findById(transcription.getRecordingSessionId())
                .orElseThrow(() -> new RecordingException(RecordingErrorCode.RECORDING_NOT_FOUND));
        RecordingAudioUpload upload = recordingAudioUploadRepository.findByRecordingId(recording.getId())
                .orElseThrow(() -> new RecordingException(RecordingErrorCode.AUDIO_UPLOAD_NOT_FOUND));
        return new RecordingTranscriptionExecution(
                recording.getWorkspaceId(),
                recording.getId(),
                transcription.getAttemptId(),
                upload.getStorageKey(),
                upload.getStorageVersionId(),
                upload.getContentType(),
                upload.getContentLength(),
                transcription.getStartedAt()
        );
    }

    private boolean hasAvailableUpload(long recordingId) {
        return recordingAudioUploadRepository.findByRecordingId(recordingId)
                .filter(RecordingAudioUpload::isAudioAvailable)
                .isPresent();
    }

    private Instant now() {
        return clock.instant()
                .truncatedTo(ChronoUnit.MICROS);
    }
}
