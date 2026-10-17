package com.knot.backend.recording.application;

import com.knot.backend.recording.application.dto.result.AudioFinalizationClaim;
import com.knot.backend.recording.application.dto.result.AudioFinalizationInput;
import com.knot.backend.recording.application.dto.result.FinalizedAudioFile;
import com.knot.backend.recording.domain.AudioFinalizationLeaseLostException;
import com.knot.backend.recording.domain.AudioStorageAccessDeniedException;
import com.knot.backend.recording.domain.RecordingException;
import com.knot.backend.recording.domain.RecordingErrorCode;
import com.knot.backend.recording.domain.model.RecordingAudioChunk;
import com.knot.backend.recording.domain.model.RecordingAudioChunkStatus;
import com.knot.backend.recording.domain.model.StoredAudioChunk;
import com.knot.backend.recording.domain.repository.RecordingAudioFinalizationRepository;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class RecordingAudioFinalizationWorker {
    private final RecordingAudioFinalizationTransaction transaction;
    private final RecordingAudioFinalizationRepository jobs;
    private final RecordingAudioChunkStorage chunks;
    private final RecordingAudioFinalStorage storage;
    private final RecordingAudioAssembler assembler;
    private final Clock clock;
    private final AtomicBoolean running = new AtomicBoolean();
    private final ExecutorService execution = Executors.newSingleThreadExecutor(
            Thread.ofPlatform()
                    .daemon()
                    .name("recording-audio-finalization")
                    .factory()
    );
    private final ScheduledExecutorService renewals = Executors.newSingleThreadScheduledExecutor(
            Thread.ofPlatform()
                    .daemon()
                    .name("recording-audio-lease")
                    .factory()
    );

    @Scheduled(fixedDelayString = "${recording.audio-finalization.poll-delay-ms:1000}")
    public void poll() {
        if (!running.compareAndSet(
                false,
                true
        )) {
            return;
        }
        try {
            execution.execute(this::drain);
        } catch (RuntimeException exception) {
            running.set(false);
            throw exception;
        }
    }

    private void drain() {
        try {
            for (Long recordingId : jobs.findUnregisteredSealedRecordingIds(20)) {
                try {
                    transaction.register(recordingId);
                } catch (RecordingException ignored) {
                    /* 다음 순회에서 재확인한다. */ }
            }
            for (Long recordingId : jobs.findRunnableRecordingIds(
                    clock.instant(),
                    20
            )) {
                transaction.claim(recordingId)
                        .ifPresent(this::process);
            }
        } finally {
            running.set(false);
        }
    }

    public void process(AudioFinalizationClaim claim) {
        AtomicBoolean lost = new AtomicBoolean();
        Runnable renewAction = () -> {
            try {
                transaction.renew(claim);
            } catch (RuntimeException exception) {
                lost.set(true);
            }
        };
        ScheduledFuture<?> renewal = renewals.scheduleAtFixedRate(
                renewAction,
                15,
                15,
                TimeUnit.SECONDS
        );
        Runnable checkpoint = () -> {
            if (lost.get() || Thread.currentThread()
                    .isInterrupted()) {
                throw new AudioFinalizationLeaseLostException();
            }
        };
        try {
            transaction.renew(claim);
            Map<Integer, StoredAudioChunk> observed = new HashMap<>();
            for (RecordingAudioChunk chunk : transaction.findChunks(claim)) {
                checkpoint.run();
                if (chunk.getStatus() != RecordingAudioChunkStatus.VERIFIED) {
                    observed.put(
                            chunk.getSequence(),
                            chunks.findStoredObject(chunk.getStorageKey())
                    );
                }
            }
            Optional<AudioFinalizationInput> input = transaction.reconcile(
                    claim,
                    observed
            );
            if (input.isEmpty()) {
                return;
            }
            AudioFinalizationInput source = input.orElseThrow();
            checkpoint.run();
            StoredAudioChunk stored = storage.findStoredFinal(source.storageKey());
            if (!stored.exists()) {
                try (FinalizedAudioFile file = assembler.assemble(
                        source.parts(),
                        source.totalFrames(),
                        checkpoint
                )) {
                    checkpoint.run();
                    stored = storage.uploadFinal(
                            source.storageKey(),
                            file.path(),
                            file.byteLength(),
                            file.checksumSha256()
                    );
                }
            } else {
                // 응답 유실 복구도 같은 고정 manifest에서 만든 checksum과 비교한다.
                try (FinalizedAudioFile file = assembler.assemble(
                        source.parts(),
                        source.totalFrames(),
                        checkpoint
                )) {
                    if (stored.byteLength() != file.byteLength() || !"audio/wav".equals(stored.contentType())
                            || !file.checksumSha256()
                                    .equals(stored.checksumSha256())) {
                        throw new RecordingException(RecordingErrorCode.AUDIO_CHUNK_MISMATCH);
                    }
                }
            }
            checkpoint.run();
            transaction.adopt(
                    claim,
                    stored
            );
        } catch (AudioFinalizationLeaseLostException ignored) {
            // 만료한 실행자는 성공·실패 상태를 제출하지 않는다.
        } catch (Exception exception) {
            boolean retryable = !(exception instanceof AudioStorageAccessDeniedException)
                    && (!(exception instanceof RecordingException recordingException)
                            || recordingException.getErrorCode() == RecordingErrorCode.AUDIO_STORAGE_UNAVAILABLE);
            try {
                transaction.fail(
                        claim,
                        retryable ? "AUDIO_STORAGE_UNAVAILABLE" : "AUDIO_CHUNK_MISMATCH",
                        retryable
                );
            } catch (AudioFinalizationLeaseLostException ignored) {
                /* 현재 실행자의 결과를 보존한다. */ }
        } finally {
            renewal.cancel(false);
        }
    }

    @PreDestroy
    public void close() {
        execution.shutdownNow();
        renewals.shutdownNow();
    }
}
