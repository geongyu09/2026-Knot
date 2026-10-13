package com.knot.backend.recording.application;

import com.knot.backend.global.exception.ProjectException;
import com.knot.backend.global.logging.ServerErrorLogger;
import com.knot.backend.recording.application.dto.result.AiTranscriptionJob;
import com.knot.backend.recording.application.dto.result.RecordingTranscriptionExecution;
import com.knot.backend.recording.application.dto.result.RecordingTranscriptionRetryResult;
import com.knot.backend.recording.domain.RecordingErrorCode;
import com.knot.backend.recording.domain.RecordingException;
import com.knot.backend.recording.domain.TranscriptionErrorCode;
import com.knot.backend.recording.domain.TranscriptionException;
import com.knot.backend.global.config.TranscriptionProperties;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class RecordingTranscriptionService {
    private static final long SHUTDOWN_WAIT_MILLIS = 10_000;

    private final RecordingTranscriptionStateService state;
    private final TranscriptionProperties properties;
    private final TranscriptionClient client;
    private final RecordingAudioStorage storage;
    private final Clock clock;
    private Thread worker;
    private boolean accepting = true;

    @PostConstruct
    public void initialize() {
        state.recoverProcessing();
    }

    public synchronized RecordingTranscriptionRetryResult retry(
            long workspaceId,
            long memberId,
            long recordingId
    ) {
        if (!properties.enabled()) {
            throw new RecordingException(RecordingErrorCode.TRANSCRIPTION_DISABLED);
        }
        if (!accepting) {
            throw new TranscriptionException(TranscriptionErrorCode.AI_NOT_READY);
        }
        RecordingTranscriptionRetryResult result = state.retry(
                workspaceId,
                memberId,
                recordingId
        );
        dispatch();
        return result;
    }

    public synchronized void dispatch() {
        if (!properties.enabled() || !accepting || worker != null) {
            return;
        }
        Optional<RecordingTranscriptionExecution> execution = state.findProcessing();
        if (execution.isEmpty()) {
            return;
        }
        RecordingTranscriptionExecution current = execution.orElseThrow();
        worker = Thread.ofPlatform()
                .name("recording-transcription")
                .unstarted(() -> execute(current));
        try {
            worker.start();
        } catch (RuntimeException exception) {
            logFailure(
                    current,
                    "start",
                    exception
            );
            if (persistFailure(
                    current,
                    "EXECUTOR_REJECTED"
            )) {
                worker = null;
            }
        }
    }

    private void execute(RecordingTranscriptionExecution execution) {
        boolean terminalPersisted = false;
        try {
            AiTranscriptionJob job = runRemote(execution);
            if (job.status() == AiTranscriptionJob.Status.SUCCEEDED) {
                terminalPersisted = persistResult(
                        execution,
                        job
                );
            } else {
                terminalPersisted = persistFailure(
                        execution,
                        job.failureCode()
                );
            }
        } catch (RuntimeException exception) {
            logFailure(
                    execution,
                    "remote",
                    exception
            );
            terminalPersisted = persistFailure(
                    execution,
                    failureCode(exception)
            );
        } finally {
            synchronized (this) {
                if (terminalPersisted) {
                    worker = null;
                    try {
                        dispatch();
                    } catch (RuntimeException exception) {
                        logFailure(
                                execution,
                                "dispatch",
                                exception
                        );
                    }
                }
            }
        }
    }

    private AiTranscriptionJob runRemote(RecordingTranscriptionExecution execution) {
        Instant deadline = execution.startedAt()
                .plus(properties.jobTimeout());
        requireTime(deadline);
        String downloadUrl = storage.presignDownload(
                execution.storageKey(),
                execution.contentType(),
                execution.contentLength()
        );
        requireTime(deadline);
        AiTranscriptionJob job;
        try {
            job = client.submit(
                    execution.attemptId(),
                    downloadUrl,
                    null
            );
        } catch (TranscriptionException exception) {
            if (exception.getErrorCode() != TranscriptionErrorCode.AI_TIMEOUT
                    && exception.getErrorCode() != TranscriptionErrorCode.AI_UNAVAILABLE) {
                throw exception;
            }
            requireTime(deadline);
            job = client.get(execution.attemptId());
        }
        requireTime(deadline);
        while (job.status() == AiTranscriptionJob.Status.PROCESSING) {
            Duration remaining = Duration.between(
                    clock.instant(),
                    deadline
            );
            Duration pause = remaining.compareTo(properties.pollInterval()) < 0 ? remaining : properties.pollInterval();
            waitForPoll(pause);
            requireTime(deadline);
            job = client.get(execution.attemptId());
            requireTime(deadline);
        }
        return job;
    }

    private void requireTime(Instant deadline) {
        if (Thread.currentThread()
                .isInterrupted()) {
            throw new TranscriptionException(TranscriptionErrorCode.AI_INTERRUPTED);
        }
        if (!clock.instant()
                .isBefore(deadline)) {
            throw new TranscriptionException(TranscriptionErrorCode.AI_TIMEOUT);
        }
    }

    private void waitForPoll(Duration duration) {
        if (duration.isNegative() || duration.isZero()) {
            throw new TranscriptionException(TranscriptionErrorCode.AI_TIMEOUT);
        }
        try {
            Thread.sleep(duration);
        } catch (InterruptedException exception) {
            Thread.currentThread()
                    .interrupt();
            throw new TranscriptionException(
                    TranscriptionErrorCode.AI_INTERRUPTED,
                    exception
            );
        }
    }

    private boolean persistResult(
            RecordingTranscriptionExecution execution,
            AiTranscriptionJob job
    ) {
        try {
            return state.complete(
                    execution,
                    job.result()
            );
        } catch (RuntimeException exception) {
            logFailure(
                    execution,
                    "complete",
                    exception
            );
            return persistFailure(
                    execution,
                    "RESULT_STORAGE_FAILED"
            );
        }
    }

    private boolean persistFailure(
            RecordingTranscriptionExecution execution,
            String failureCode
    ) {
        boolean interrupted = Thread.interrupted();
        try {
            return state.fail(
                    execution,
                    failureCode
            );
        } catch (RuntimeException exception) {
            logFailure(
                    execution,
                    "fail",
                    exception
            );
            return false;
        } finally {
            if (interrupted) {
                Thread.currentThread()
                        .interrupt();
            }
        }
    }

    private String failureCode(RuntimeException exception) {
        if (exception instanceof ProjectException failure) {
            return failure.getErrorCode()
                    .getCode();
        }
        return "INFERENCE_FAILED";
    }

    private void logFailure(
            RecordingTranscriptionExecution execution,
            String phase,
            RuntimeException exception
    ) {
        ServerErrorLogger.recordTaskFailure(
                log,
                "Transcription failure recordingId=" + execution.recordingId() + " attemptId=" + execution.attemptId()
                        + " phase=" + phase,
                exception
        );
    }

    @PreDestroy
    public void close() {
        Thread running;
        synchronized (this) {
            accepting = false;
            running = worker;
            if (running != null) {
                running.interrupt();
            }
        }
        if (running != null) {
            try {
                running.join(SHUTDOWN_WAIT_MILLIS);
            } catch (InterruptedException exception) {
                Thread.currentThread()
                        .interrupt();
            }
        }
    }
}
