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
            throw new RecordingException(RecordingErrorCode.AI_NOT_READY);
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
        state.findProcessing()
                .ifPresent(execution -> {
                    worker = Thread.ofPlatform()
                            .name("recording-transcription")
                            .unstarted(() -> execute(execution));
                    worker.start();
                });
    }

    private void execute(RecordingTranscriptionExecution execution) {
        try {
            AiTranscriptionJob job = runRemote(execution);
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
            String code = exception instanceof ProjectException failure
                    ? failure.getErrorCode()
                            .getCode()
                    : "INFERENCE_FAILED";
            fail(
                    execution,
                    code
            );
        }
    }

    private AiTranscriptionJob runRemote(RecordingTranscriptionExecution execution) {
        Instant deadline = execution.startedAt()
                .plus(properties.jobTimeout());
        requireTime(deadline);
        String url = storage.presignDownload(
                execution.storageKey(),
                execution.contentType(),
                execution.contentLength()
        );
        requireTime(deadline);
        AiTranscriptionJob job;
        try {
            job = client.submit(
                    execution.attemptId(),
                    url
            );
        } catch (RecordingException exception) {
            if (exception.getErrorCode() != RecordingErrorCode.AI_TIMEOUT
                    && exception.getErrorCode() != RecordingErrorCode.AI_UNAVAILABLE) {
                throw exception;
            }
            requireTime(deadline);
            job = client.get(execution.attemptId());
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
                        remaining.compareTo(properties.pollInterval()) < 0 ? remaining : properties.pollInterval()
                );
            } catch (InterruptedException exception) {
                Thread.currentThread()
                        .interrupt();
                throw new RecordingException(
                        RecordingErrorCode.AI_INTERRUPTED,
                        exception
                );
            }
            requireTime(deadline);
            job = client.get(execution.attemptId());
        }
        return job;
    }

    private void requireTime(Instant deadline) {
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
            state.complete(
                    execution,
                    result
            );
            worker = null;
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
            String code
    ) {
        boolean interrupted = Thread.interrupted();
        try {
            state.fail(
                    execution,
                    code
            );
            worker = null;
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
                running.join(10_000);
            } catch (InterruptedException exception) {
                Thread.currentThread()
                        .interrupt();
            }
        }
    }
}
