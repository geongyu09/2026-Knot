package com.knot.ai.transcription.infrastructure;

import com.knot.ai.global.AiServerProperties;
import com.knot.ai.preparation.application.AudioPreparationEngine;
import com.knot.ai.preparation.domain.AudioPreparationResult;
import com.knot.ai.transcription.domain.TranscriptionErrorCode;
import com.knot.ai.transcription.domain.TranscriptionException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.LinkOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.DigestOutputStream;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

@Component
public class FfmpegAudioPreparationEngine implements AudioPreparationEngine {
    private static final long MAX_PCM_BYTES = 230400000L;

    private final AiServerProperties properties;
    private final S3AudioDownloader downloader;
    private final ProcessSupervisor supervisor;
    private final Path root;
    private volatile boolean ready;

    public FfmpegAudioPreparationEngine(
            AiServerProperties properties,
            S3AudioDownloader downloader,
            JsonMapper mapper
    ) throws Exception {
        this.properties = properties;
        this.downloader = downloader;
        Path inference = properties.workDirectory()
                .toAbsolutePath()
                .normalize();
        root = inference.resolveSibling(inference.getFileName() + "-preparations");
        supervisor = new ProcessSupervisor(
                properties,
                mapper,
                () -> ready = false
        );
        if (Files.isSymbolicLink(root)) {
            throw failure();
        }
        Files.createDirectories(root);
        Files.setPosixFilePermissions(
                root,
                PosixFilePermissions.fromString("rwx------")
        );
        try (java.util.stream.Stream<Path> paths = Files.list(root)) {
            for (Path path : paths.toList()) {
                if (Files.isSymbolicLink(path) || !Files.isDirectory(
                        path,
                        LinkOption.NOFOLLOW_LINKS
                )) {
                    throw failure();
                }
                cleanup(
                        UUID.fromString(
                                path.getFileName()
                                        .toString()
                        )
                );
            }
        }
        ready = true;
    }

    @Override
    public AudioPreparationResult prepare(
            UUID attemptId,
            String downloadUrl
    ) throws Exception {
        Path directory = directory(attemptId);
        Files.createDirectory(directory);
        Files.setPosixFilePermissions(
                directory,
                PosixFilePermissions.fromString("rwx------")
        );
        Path source = directory.resolve("preparation-source");
        Path pcm = directory.resolve("preparation.pcm");
        downloader.download(
                downloadUrl,
                source
        );
        supervisor.runDecoding(
                List.of(
                        properties.ffmpeg(),
                        "-nostdin",
                        "-v",
                        "error",
                        "-y",
                        "-threads",
                        "1",
                        "-i",
                        source.toString(),
                        "-vn",
                        "-ac",
                        "1",
                        "-ar",
                        "16000",
                        "-c:a",
                        "pcm_s16le",
                        "-t",
                        "7201",
                        "-fs",
                        "230400002",
                        "-f",
                        "s16le",
                        pcm.toString()
                ),
                directory,
                properties.conversionTimeout()
        );
        long length = Files.size(pcm);
        if (length <= 0 || length % 2 != 0 || length > MAX_PCM_BYTES) {
            throw new TranscriptionException(TranscriptionErrorCode.AUDIO_DURATION_EXCEEDED);
        }
        Path target = audio(attemptId);
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = Files.newInputStream(pcm);
                OutputStream output = new DigestOutputStream(
                        Files.newOutputStream(target),
                        digest
                )) {
            output.write(header(length));
            byte[] buffer = new byte[65536];
            long copied = 0;
            int count;
            while ((count = input.read(buffer)) >= 0) {
                if (Thread.currentThread()
                        .isInterrupted()) {
                    throw new InterruptedException();
                }
                copied += count;
                if (copied > length) {
                    throw failure();
                }
                output.write(
                        buffer,
                        0,
                        count
                );
            }
            if (copied != length) {
                throw failure();
            }
        }
        Files.setPosixFilePermissions(
                target,
                PosixFilePermissions.fromString("rw-------")
        );
        Files.delete(source);
        Files.delete(pcm);
        return new AudioPreparationResult(
                1,
                "pcm16le-16k-mono-v1",
                length / 2,
                length + 44,
                Base64.getEncoder()
                        .encodeToString(digest.digest())
        );
    }

    static byte[] header(long length) {
        return ByteBuffer.allocate(44)
                .order(ByteOrder.LITTLE_ENDIAN)
                .putInt(0x46464952)
                .putInt((int) (length + 36))
                .putInt(0x45564157)
                .putInt(0x20746d66)
                .putInt(16)
                .putShort((short) 1)
                .putShort((short) 1)
                .putInt(16000)
                .putInt(32000)
                .putShort((short) 2)
                .putShort((short) 16)
                .putInt(0x61746164)
                .putInt((int) length)
                .array();
    }

    @Override
    public Path audio(UUID attemptId) {
        return directory(attemptId).resolve("prepared.wav");
    }

    @Override
    public void cleanup(UUID attemptId) throws Exception {
        Path directory = directory(attemptId);
        if (Files.isSymbolicLink(directory)) {
            throw failure();
        }
        if (!Files.exists(directory)) {
            return;
        }
        supervisor.cleanupOwnership(directory);
        try (java.util.stream.Stream<Path> files = Files.walk(directory)) {
            for (Path file : files.sorted(Comparator.reverseOrder())
                    .toList()) {
                Files.delete(file);
            }
        }
    }

    @Override
    public boolean isReady() {
        return ready;
    }

    @jakarta.annotation.PreDestroy
    public void closeEmptyRoot() throws Exception {
        ready = false;
        try (java.util.stream.Stream<Path> paths = Files.list(root)) {
            if (paths.findAny()
                    .isEmpty()) {
                Files.delete(root);
            }
        }
    }

    private Path directory(UUID attemptId) {
        return root.resolve(attemptId.toString());
    }

    private static TranscriptionException failure() {
        return new TranscriptionException(TranscriptionErrorCode.UNOWNED_WORK_DIRECTORY);
    }
}
