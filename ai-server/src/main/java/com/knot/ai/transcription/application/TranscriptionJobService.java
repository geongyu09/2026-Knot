package com.knot.ai.transcription.application;

import com.knot.ai.transcription.application.command.CreateTranscriptionCommand;
import com.knot.ai.transcription.domain.TranscriptResult;
import com.knot.ai.transcription.domain.TranscriptionErrorCode;
import com.knot.ai.transcription.domain.TranscriptionException;
import jakarta.annotation.PreDestroy;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class TranscriptionJobService {
    private static final Logger LOGGER = LoggerFactory.getLogger(TranscriptionJobService.class);
    private static final long SHUTDOWN_WAIT_MILLIS = 15_000;

    private final TranscriptionEngine engine;
    private JobSnapshot current;
    private CreateTranscriptionCommand currentRequest;
    private Thread worker;
    private boolean accepting = true;

    public TranscriptionJobService(TranscriptionEngine engine) {
        this.engine = engine;
    }

    public synchronized JobSnapshot create(CreateTranscriptionCommand request) {
        if (!accepting) {
            throw new TranscriptionException(TranscriptionErrorCode.NOT_READY);
        }
        if (current != null && current.attemptId()
                .equals(request.attemptId())) {
            boolean sameWindow = Objects.equals(
                    currentRequest.window(),
                    request.window()
            );
            boolean sameSpeakerCount = request.window() == null || Objects.equals(
                    currentRequest.speakerCount(),
                    request.speakerCount()
            );
            if (!sameWindow || !sameSpeakerCount) {
                throw new TranscriptionException(TranscriptionErrorCode.ATTEMPT_CONFLICT);
            }
            return current;
        }
        if (worker != null) {
            throw new TranscriptionException(TranscriptionErrorCode.BUSY);
        }
        if (!engine.isReady()) {
            throw new TranscriptionException(TranscriptionErrorCode.NOT_READY);
        }
        currentRequest = request;
        current = new JobSnapshot(
                request.attemptId(),
                JobSnapshot.Status.PROCESSING,
                null,
                null
        );
        worker = Thread.ofPlatform()
                .name("transcription-job")
                .unstarted(() -> execute(request));
        try {
            worker.start();
        } catch (RuntimeException exception) {
            logFailure(
                    request.attemptId(),
                    TranscriptionErrorCode.EXECUTOR_REJECTED.getCode(),
                    exception
            );
            current = new JobSnapshot(
                    request.attemptId(),
                    JobSnapshot.Status.FAILED,
                    TranscriptionErrorCode.EXECUTOR_REJECTED.getCode(),
                    null
            );
            worker = null;
        }
        return current;
    }

    public synchronized JobSnapshot get(UUID attemptId) {
        if (current == null || !current.attemptId()
                .equals(attemptId)) {
            throw new TranscriptionException(TranscriptionErrorCode.JOB_NOT_FOUND);
        }
        return current;
    }

    public synchronized boolean isReady() {
        return accepting && engine.isReady();
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

    private void logFailure(
            UUID attemptId,
            String code,
            Exception exception
    ) {
        LOGGER.warn(
                "전사 작업 실패 attemptId={} code={} exception={} cause={} location={}",
                attemptId,
                code,
                exception.getClass()
                        .getName(),
                exception.getCause() == null
                        ? "없음"
                        : exception.getCause()
                                .getClass()
                                .getName(),
                exception.getStackTrace().length == 0 ? "없음" : exception.getStackTrace()[0]
        );
    }

    private void execute(CreateTranscriptionCommand request) {
        JobSnapshot outcome = new JobSnapshot(
                request.attemptId(),
                JobSnapshot.Status.FAILED,
                TranscriptionErrorCode.INFERENCE_FAILED.getCode(),
                null
        );
        try {
            TranscriptResult result = Objects.requireNonNull(engine.transcribe(request));
            outcome = new JobSnapshot(
                    request.attemptId(),
                    JobSnapshot.Status.SUCCEEDED,
                    null,
                    result
            );
        } catch (Exception exception) {
            if (exception instanceof TranscriptionException failure) {
                outcome = new JobSnapshot(
                        request.attemptId(),
                        JobSnapshot.Status.FAILED,
                        failure.getCode(),
                        null
                );
            }
            logFailure(
                    request.attemptId(),
                    outcome.failureCode(),
                    exception
            );
        } finally {
            Thread.interrupted();
            try {
                engine.cleanup(request.attemptId());
            } catch (Exception exception) {
                synchronized (this) {
                    accepting = false;
                }
                logFailure(
                        request.attemptId(),
                        TranscriptionErrorCode.PROCESS_CLEANUP_FAILED.getCode(),
                        exception
                );
            }
            synchronized (this) {
                current = outcome;
                worker = null;
            }
        }
    }
}
