package com.knot.backend.recording.application;

import com.knot.backend.global.config.TranscriptionProperties;
import com.knot.backend.recording.application.RecordingInputPreparationClient.Result;
import com.knot.backend.recording.application.RecordingInputPreparationClient.Snapshot;
import com.knot.backend.recording.application.RecordingInputPreparationState.Claim;
import com.knot.backend.recording.domain.RecordingErrorCode;
import com.knot.backend.recording.domain.RecordingException;
import com.knot.backend.recording.domain.model.StoredAudioChunk;
import com.knot.backend.recording.domain.repository.RecordingTranscriptionInputRepository;
import jakarta.annotation.PreDestroy;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class RecordingInputPreparationWorker {
    private final RecordingInputPreparationState state;
    private final RecordingTranscriptionInputRepository inputs;
    private final RecordingInputPreparationClient client;
    private final RecordingAudioStorage downloads;
    private final RecordingAudioFinalStorage storage;
    private final TranscriptionProperties properties;
    private final Clock clock;
    private final ScheduledExecutorService renewals = Executors.newSingleThreadScheduledExecutor(
            Thread.ofPlatform()
                    .daemon()
                    .name("audio-preparation-lease")
                    .factory()
    );
    private volatile boolean accepting = true;
    private Thread worker;

    @Scheduled(fixedDelayString = "${knot.transcription.dispatch-delay-ms:1000}")
    public synchronized void recoverAndDispatch() {
        if (!accepting || !properties.enabled() || worker != null) {
            return;
        }
        for (Long id : inputs.findCandidates(
                clock.instant(),
                20
        )) {
            Optional<Claim> claim = state.claim(
                    id,
                    properties.leaseDuration()
            );
            if (claim.isPresent()) {
                worker = Thread.ofPlatform()
                        .name("audio-preparation")
                        .unstarted(() -> execute(claim.orElseThrow()));
                worker.start();
                return;
            }
        }
    }

    void execute(Claim claim) {
        AtomicBoolean owned = new AtomicBoolean(true);
        Runnable renew = () -> {
            try {
                owned.set(
                        state.renew(
                                claim,
                                properties.leaseDuration()
                        )
                );
            } catch (RuntimeException exception) {
                owned.set(false);
            }
        };
        ScheduledFuture<?> heartbeat = renewals.scheduleAtFixedRate(
                renew,
                properties.leaseRenewInterval()
                        .toMillis(),
                properties.leaseRenewInterval()
                        .toMillis(),
                TimeUnit.MILLISECONDS
        );
        try {
            while (accepting && owned.get()) {
                Snapshot snapshot;
                try {
                    snapshot = client.get(claim.attemptId());
                } catch (RecordingException exception) {
                    if (exception.getErrorCode() != RecordingErrorCode.AI_JOB_NOT_FOUND) {
                        throw exception;
                    }
                    checkpoint(
                            claim,
                            owned
                    );
                    snapshot = client.submit(
                            claim.attemptId(),
                            downloads.presignDownload(
                                    claim.sourceStorageKey(),
                                    claim.sourceVersionId(),
                                    claim.sourceContentType(),
                                    claim.sourceContentLength()
                            )
                    );
                }
                checkpoint(
                        claim,
                        owned
                );
                if ("FAILED".equals(snapshot.status())) {
                    state.fail(
                            claim,
                            "INPUT_PREPARATION_FAILED"
                    );
                    return;
                }
                if ("SUCCEEDED".equals(snapshot.status())) {
                    materialize(
                            claim,
                            snapshot.result(),
                            owned
                    );
                    return;
                }
                TimeUnit.MILLISECONDS.sleep(
                        properties.pollInterval()
                                .toMillis()
                );
            }
        } catch (RecordingException exception) {
            if (exception.getErrorCode() == RecordingErrorCode.AI_INVALID_RESPONSE) {
                state.fail(
                        claim,
                        "INPUT_PREPARATION_INVALID"
                );
            } else {
                log.warn(
                        "전사 입력 준비 복구 대기 recordingId={} type={}",
                        claim.recordingId(),
                        exception.getClass()
                                .getSimpleName()
                );
            }
        } catch (InterruptedException exception) {
            Thread.currentThread()
                    .interrupt();
        } catch (RuntimeException | java.io.IOException exception) {
            log.warn(
                    "전사 입력 준비 복구 대기 recordingId={} type={}",
                    claim.recordingId(),
                    exception.getClass()
                            .getSimpleName()
            );
        } finally {
            heartbeat.cancel(false);
            synchronized (this) {
                worker = null;
            }
        }
    }

    private void materialize(
            Claim claim,
            Result result,
            AtomicBoolean owned
    ) throws java.io.IOException {
        if (result == null || result.schemaVersion() != 1
                || !"pcm16le-16k-mono-v1".equals(result.normalizationVersion()) || result.totalFrames() <= 0
                || result.totalFrames() > 115_200_000 || result.byteLength() != 44 + result.totalFrames() * 2
                || result.checksumSha256() == null || !result.checksumSha256()
                        .matches("[A-Za-z0-9+/]{43}=")) {
            state.fail(
                    claim,
                    "INPUT_PREPARATION_INVALID"
            );
            return;
        }
        ProcessHandle process = ProcessHandle.current();
        Path file = Files.createFile(
                Path.of(
                        System.getProperty("java.io.tmpdir"),
                        "knot-recording-wav-" + process.pid() + "-" + process.info()
                                .startInstant()
                                .orElseThrow()
                                .toEpochMilli() + "-" + UUID.randomUUID() + ".tmp"
                ),
                PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------"))
        );
        try {
            checkpoint(
                    claim,
                    owned
            );
            client.download(
                    claim.attemptId(),
                    file,
                    result.byteLength()
            );
            checkpoint(
                    claim,
                    owned
            );
            if (Files.size(file) != result.byteLength()) {
                state.fail(
                        claim,
                        "INPUT_PREPARATION_INVALID"
                );
                return;
            }
            MessageDigest digest = sha256();
            try (java.io.InputStream input = Files.newInputStream(file)) {
                byte[] header = input.readNBytes(44);
                if (!canonical(
                        header,
                        result.totalFrames()
                )) {
                    state.fail(
                            claim,
                            "INPUT_PREPARATION_INVALID"
                    );
                    return;
                }
                digest.update(header);
                byte[] buffer = new byte[16_384];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (!accepting || !owned.get() || Thread.currentThread()
                            .isInterrupted()) {
                        throw new RecordingException(RecordingErrorCode.RECORDING_NOT_FOUND);
                    }
                    digest.update(
                            buffer,
                            0,
                            count
                    );
                }
            }
            byte[] hash = digest.digest();
            String checksum = Base64.getEncoder()
                    .encodeToString(hash);
            if (!checksum.equals(result.checksumSha256())) {
                state.fail(
                        claim,
                        "INPUT_PREPARATION_INVALID"
                );
                return;
            }
            checkpoint(
                    claim,
                    owned
            );
            String key = "recordings/" + claim.recordingId() + "/prepared/" + claim.attemptId() + "/" + HexFormat.of()
                    .formatHex(hash) + ".wav";
            StoredAudioChunk stored = storage.uploadFinal(
                    key,
                    file,
                    result.byteLength(),
                    checksum
            );
            checkpoint(
                    claim,
                    owned
            );
            state.ready(
                    claim,
                    key,
                    stored,
                    result.totalFrames()
            );
        } finally {
            Files.deleteIfExists(file);
        }
    }

    private boolean canonical(
            byte[] header,
            long frames
    ) {
        if (header.length != 44) {
            return false;
        }
        ByteBuffer bytes = ByteBuffer.wrap(header)
                .order(ByteOrder.LITTLE_ENDIAN);
        return bytes.getInt(0) == 0x46464952 && Integer.toUnsignedLong(bytes.getInt(4)) == 36 + frames * 2
                && bytes.getInt(8) == 0x45564157 && bytes.getInt(12) == 0x20746d66 && bytes.getInt(16) == 16
                && bytes.getShort(20) == 1 && bytes.getShort(22) == 1 && bytes.getInt(24) == 16000
                && bytes.getInt(28) == 32000 && bytes.getShort(32) == 2 && bytes.getShort(34) == 16
                && bytes.getInt(36) == 0x61746164 && Integer.toUnsignedLong(bytes.getInt(40)) == frames * 2;
    }

    private MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new RecordingException(
                    RecordingErrorCode.AUDIO_STORAGE_UNAVAILABLE,
                    exception
            );
        }
    }

    private void checkpoint(
            Claim claim,
            AtomicBoolean owned
    ) {
        if (!accepting || !owned.get() || !state.renew(
                claim,
                properties.leaseDuration()
        )) {
            throw new RecordingException(RecordingErrorCode.RECORDING_NOT_FOUND);
        }
    }

    @PreDestroy
    public synchronized void close() {
        accepting = false;
        if (worker != null) {
            worker.interrupt();
        }
        renewals.shutdownNow();
    }
}
