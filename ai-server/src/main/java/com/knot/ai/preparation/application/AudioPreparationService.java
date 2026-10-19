package com.knot.ai.preparation.application;

import com.knot.ai.preparation.domain.AudioPreparationResult;
import com.knot.ai.transcription.domain.TranscriptionErrorCode;
import com.knot.ai.transcription.domain.TranscriptionException;
import jakarta.annotation.PreDestroy;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.UUID;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Autowired;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.InputStreamResource;
import org.springframework.stereotype.Service;

@Service
public class AudioPreparationService {
    private static final Logger log = LoggerFactory.getLogger(AudioPreparationService.class);
    private static final Duration TERMINAL_TTL = Duration.ofMinutes(15);

    private final AudioPreparationEngine engine;
    private final Clock clock;
    private final ScheduledExecutorService cleaner;
    private AudioPreparationSnapshot current;
    private Instant expiresAt;
    private Thread worker;
    private volatile boolean accepting = true;
    private int readers;

    @Autowired
    public AudioPreparationService(AudioPreparationEngine engine) {
        this(
                engine,
                Clock.systemUTC()
        );
    }

    AudioPreparationService(
            AudioPreparationEngine engine,
            Clock clock
    ) {
        this.engine = engine;
        this.clock = clock;
        cleaner = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform()
                        .daemon()
                        .name("preparation-cache-cleanup")
                        .factory()
        );
        Runnable expireCache = () -> {
            try {
                cleanupExpired();
            } catch (RuntimeException exception) {
                log.warn("오디오 준비 캐시 정리를 완료하지 못했습니다");
            }
        };
        cleaner.scheduleWithFixedDelay(
                expireCache,
                1,
                1,
                TimeUnit.MINUTES
        );
    }

    public synchronized AudioPreparationSnapshot create(
            UUID attemptId,
            String downloadUrl
    ) {
        if (!accepting || !engine.isReady()) {
            throw new TranscriptionException(TranscriptionErrorCode.NOT_READY);
        }
        cleanupExpired();
        if (current != null && current.attemptId()
                .equals(attemptId) && !expired()) {
            return current;
        }
        if (worker != null || readers > 0) {
            throw new TranscriptionException(TranscriptionErrorCode.BUSY);
        }
        if (current != null) {
            cleanup(current.attemptId());
        }
        expiresAt = null;
        current = new AudioPreparationSnapshot(
                attemptId,
                AudioPreparationSnapshot.Status.PROCESSING,
                null,
                null
        );
        worker = Thread.ofPlatform()
                .name("audio-preparation")
                .unstarted(
                        () -> execute(
                                attemptId,
                                downloadUrl
                        )
                );
        try {
            worker.start();
        } catch (RuntimeException failure) {
            worker = null;
            current = new AudioPreparationSnapshot(
                    attemptId,
                    AudioPreparationSnapshot.Status.FAILED,
                    "EXECUTOR_REJECTED",
                    null
            );
            expiresAt = clock.instant()
                    .plus(TERMINAL_TTL);
        }
        return current;
    }

    public synchronized AudioPreparationSnapshot get(UUID attemptId) {
        if (expired()) {
            try {
                cleanupExpired();
            } catch (RuntimeException exception) {
                log.warn("만료된 오디오 준비 캐시 정리를 완료하지 못했습니다");
            }
            throw new TranscriptionException(TranscriptionErrorCode.JOB_NOT_FOUND);
        }
        if (current == null || !current.attemptId()
                .equals(attemptId)) {
            throw new TranscriptionException(TranscriptionErrorCode.JOB_NOT_FOUND);
        }
        return current;
    }

    public synchronized AudioDownload audio(UUID attemptId) throws IOException {
        AudioPreparationSnapshot snapshot = get(attemptId);
        if (snapshot.status() != AudioPreparationSnapshot.Status.SUCCEEDED) {
            throw new TranscriptionException(TranscriptionErrorCode.NOT_READY);
        }
        InputStream input = Files.newInputStream(engine.audio(attemptId));
        readers++;
        InputStream pinned = new FilterInputStream(input) {
            private boolean closed;
            @Override
            public void close() throws IOException {
                synchronized (AudioPreparationService.this) {
                    if (closed) {
                        return;
                    }
                    closed = true;
                    try {
                        super.close();
                    } finally {
                        readers--;
                        if (!accepting && worker == null && readers == 0 && current != null) {
                            cleanup(current.attemptId());
                        } else {
                            cleanupExpired();
                        }
                    }
                }
            }
        };
        return new AudioDownload(
                new InputStreamResource(pinned),
                snapshot.result()
                        .byteLength()
        );
    }

    private void execute(
            UUID attemptId,
            String url
    ) {
        AudioPreparationSnapshot outcome;
        try {
            AudioPreparationResult result = engine.prepare(
                    attemptId,
                    url
            );
            outcome = new AudioPreparationSnapshot(
                    attemptId,
                    AudioPreparationSnapshot.Status.SUCCEEDED,
                    null,
                    result
            );
        } catch (Exception exception) {
            String code = exception instanceof TranscriptionException failure ? failure.getCode() : "DECODE_FAILED";
            Thread.interrupted();
            try {
                cleanup(attemptId);
            } catch (RuntimeException cleanupFailure) {
                code = "PROCESS_CLEANUP_FAILED";
            }
            outcome = new AudioPreparationSnapshot(
                    attemptId,
                    AudioPreparationSnapshot.Status.FAILED,
                    code,
                    null
            );
        }
        synchronized (this) {
            current = outcome;
            expiresAt = clock.instant()
                    .plus(TERMINAL_TTL);
            worker = null;
        }
    }

    public synchronized void cleanupExpired() {
        if (current != null && expired() && worker == null && readers == 0) {
            cleanup(current.attemptId());
            current = null;
            expiresAt = null;
        }
    }

    private boolean expired() {
        return expiresAt != null && !clock.instant()
                .isBefore(expiresAt);
    }

    private void cleanup(UUID attemptId) {
        try {
            engine.cleanup(attemptId);
        } catch (Exception exception) {
            accepting = false;
            throw new TranscriptionException(TranscriptionErrorCode.PROCESS_CLEANUP_FAILED);
        }
    }

    @PreDestroy
    public void close() {
        cleaner.shutdownNow();
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
                running.join(15000);
            } catch (InterruptedException exception) {
                Thread.currentThread()
                        .interrupt();
            }
        }
        synchronized (this) {
            if (worker == null && readers == 0 && current != null) {
                cleanup(current.attemptId());
            }
        }
    }

    public record AudioDownload(
            InputStreamResource resource,
            long byteLength
    ) {
    }
}
