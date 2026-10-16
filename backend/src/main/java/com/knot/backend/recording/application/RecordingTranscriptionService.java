package com.knot.backend.recording.application;

import com.knot.backend.global.config.TranscriptionProperties;
import com.knot.backend.global.exception.ProjectException;
import com.knot.backend.global.logging.ServerErrorLogger;
import com.knot.backend.recording.application.dto.result.AiTranscript;
import com.knot.backend.recording.application.dto.result.AiTranscriptionJob;
import com.knot.backend.recording.application.dto.result.RecordingTranscriptionExecution;
import com.knot.backend.recording.application.dto.result.RecordingTranscriptionRetryResult;
import com.knot.backend.recording.domain.RecordingErrorCode;
import com.knot.backend.recording.domain.RecordingException;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class RecordingTranscriptionService {
    private final RecordingTranscriptionStateService recordingTranscriptionStateService;
    private final TranscriptionProperties transcriptionProperties;
    private final TranscriptionClient transcriptionClient;
    private final RecordingAudioStorage recordingAudioStorage;
    private final Clock clock;
    private Thread transcriptionThread;
    private boolean acceptingTranscriptionRequests = true;

    @PostConstruct
    public void initialize() {
        recordingTranscriptionStateService.recoverProcessing();
    }

    public synchronized RecordingTranscriptionRetryResult retry(
            long workspaceId,
            long memberId,
            long recordingId
    ) {
        if (!transcriptionProperties.enabled()) {
            throw new RecordingException(RecordingErrorCode.TRANSCRIPTION_DISABLED);
        }
        if (!acceptingTranscriptionRequests) {
            throw new RecordingException(RecordingErrorCode.AI_NOT_READY);
        }
        RecordingTranscriptionRetryResult result = recordingTranscriptionStateService.retry(
                workspaceId,
                memberId,
                recordingId
        );
        dispatch();
        return result;
    }

    public synchronized void dispatch() {
        if (!transcriptionProperties.enabled() || !acceptingTranscriptionRequests || transcriptionThread != null) {
            return;
        }
        recordingTranscriptionStateService.findProcessing()
                .ifPresent(execution -> {
                    transcriptionThread = Thread.ofPlatform()
                            .name("recording-transcription")
                            .unstarted(() -> execute(execution));
                    transcriptionThread.start();
                });
    }

    private void execute(RecordingTranscriptionExecution execution) {
        try {
            AiTranscriptionJob job = submitAndAwaitTranscription(execution);
            if (job.status() == AiTranscriptionJob.Status.SUCCEEDED) {
                complete(
                        execution,
                        job.result()
                );
            } else {
                fail(
                        execution,
                        job.failureCode()
                );
            }
        } catch (RuntimeException exception) {
            logFailure(
                    execution,
                    exception
            );
            String failureCode = exception instanceof ProjectException failure
                    ? failure.getErrorCode()
                            .getCode()
                    : "INFERENCE_FAILED";
            fail(
                    execution,
                    failureCode
            );
        }
    }

    private AiTranscriptionJob submitAndAwaitTranscription(RecordingTranscriptionExecution execution) {
        Instant deadline = execution.startedAt()
                .plus(transcriptionProperties.jobTimeout());
        checkInterruptionAndTimeout(deadline);
        String audioDownloadUrl = recordingAudioStorage.presignDownload(
                execution.storageKey(),
                execution.storageVersionId(),
                execution.contentType(),
                execution.contentLength()
        );
        checkInterruptionAndTimeout(deadline);
        AiTranscriptionJob job;
        try {
            job = transcriptionClient.submit(
                    execution.attemptId(),
                    audioDownloadUrl
            );
        } catch (RecordingException exception) {
            if (exception.getErrorCode() != RecordingErrorCode.AI_TIMEOUT
                    && exception.getErrorCode() != RecordingErrorCode.AI_UNAVAILABLE) {
                throw exception;
            }
            checkInterruptionAndTimeout(deadline);
            job = transcriptionClient.get(execution.attemptId());
        }
        while (job.status() == AiTranscriptionJob.Status.PROCESSING) {
            Duration remaining = Duration.between(
                    clock.instant(),
                    deadline
            );
            if (remaining.isNegative() || remaining.isZero()) {
                throw new RecordingException(RecordingErrorCode.AI_TIMEOUT);
            }
            try {
                Thread.sleep(
                        remaining.compareTo(transcriptionProperties.pollInterval()) < 0
                                ? remaining
                                : transcriptionProperties.pollInterval()
                );
            } catch (InterruptedException exception) {
                Thread.currentThread()
                        .interrupt();
                throw new RecordingException(
                        RecordingErrorCode.AI_INTERRUPTED,
                        exception
                );
            }
            checkInterruptionAndTimeout(deadline);
            job = transcriptionClient.get(execution.attemptId());
        }
        return job;
    }

    private void checkInterruptionAndTimeout(Instant deadline) {
        if (Thread.currentThread()
                .isInterrupted()) {
            throw new RecordingException(RecordingErrorCode.AI_INTERRUPTED);
        }
        if (!clock.instant()
                .isBefore(deadline)) {
            throw new RecordingException(RecordingErrorCode.AI_TIMEOUT);
        }
    }

    private synchronized void complete(
            RecordingTranscriptionExecution execution,
            AiTranscript result
    ) {
        try {
            // DB 확정과 슬롯 해제를 묶어 다음 dispatch가 중간 상태를 보지 않게 한다.
            recordingTranscriptionStateService.complete(
                    execution,
                    result
            );
            transcriptionThread = null;
        } catch (RuntimeException exception) {
            logFailure(
                    execution,
                    exception
            );
            fail(
                    execution,
                    "RESULT_STORAGE_FAILED"
            );
        }
    }

    private synchronized void fail(
            RecordingTranscriptionExecution execution,
            String failureCode
    ) {
        boolean interrupted = Thread.interrupted();
        try {
            recordingTranscriptionStateService.fail(
                    execution,
                    failureCode
            );
            transcriptionThread = null;
        } catch (RuntimeException exception) {
            logFailure(
                    execution,
                    exception
            );
        } finally {
            if (interrupted) {
                Thread.currentThread()
                        .interrupt();
            }
        }
    }

    private void logFailure(
            RecordingTranscriptionExecution execution,
            RuntimeException exception
    ) {
        ServerErrorLogger.recordTaskFailure(
                log,
                "Transcription failure recordingId=" + execution.recordingId() + " attemptId=" + execution.attemptId(),
                exception
        );
    }

    @PreDestroy
    public void close() {
        Thread runningThread;
        synchronized (this) {
            acceptingTranscriptionRequests = false;
            runningThread = transcriptionThread;
            if (runningThread != null) {
                runningThread.interrupt();
            }
        }
        if (runningThread != null) {
            try {
                runningThread.join(10_000);
            } catch (InterruptedException exception) {
                Thread.currentThread()
                        .interrupt();
            }
        }
    }
}
