package com.knot.ai.transcription.infrastructure;

import com.knot.ai.global.AiServerProperties;
import com.knot.ai.transcription.domain.TranscriptionErrorCode;
import com.knot.ai.transcription.domain.TranscriptionException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class ProcessSupervisor {
    private static final Logger LOGGER = LoggerFactory.getLogger(ProcessSupervisor.class);

    private final AiServerProperties properties;
    private final JsonMapper mapper;
    private final Runnable markNotReady;

    ProcessSupervisor(
            AiServerProperties properties,
            JsonMapper mapper,
            Runnable markNotReady
    ) {
        this.properties = properties;
        this.mapper = mapper;
        this.markNotReady = markNotReady;
    }

    void runDecoding(
            List<String> command,
            Path directory,
            Duration timeout
    ) throws Exception {
        supervise(
                command,
                directory,
                timeout,
                TranscriptionErrorCode.DECODE_TIMEOUT,
                TranscriptionErrorCode.DECODE_FAILED
        );
    }

    void runInference(
            List<String> command,
            Path directory,
            Duration timeout
    ) throws Exception {
        supervise(
                command,
                directory,
                timeout,
                TranscriptionErrorCode.INFERENCE_TIMEOUT,
                null
        );
    }

    void cleanupOwnership(Path directory) throws IOException, InterruptedException {
        Path ownership = directory.resolve("process-owner.json");
        if (!Files.exists(ownership)) {
            return;
        }
        Process process = new ProcessBuilder(
                properties.python(),
                supervisor().toString(),
                "--cleanup",
                ownership.toString()
        ).redirectOutput(ProcessBuilder.Redirect.DISCARD)
                .redirectError(ProcessBuilder.Redirect.DISCARD)
                .start();
        if (!process.waitFor(
                15,
                TimeUnit.SECONDS
        )) {
            process.destroyForcibly();
            markNotReady.run();
            throw new TranscriptionException(TranscriptionErrorCode.PROCESS_CLEANUP_FAILED);
        }
        if (process.exitValue() != 0) {
            markNotReady.run();
            throw new TranscriptionException(TranscriptionErrorCode.PROCESS_CLEANUP_FAILED);
        }
    }

    private void supervise(
            List<String> command,
            Path directory,
            Duration timeout,
            TranscriptionErrorCode timeoutCode,
            TranscriptionErrorCode failureCode
    ) throws Exception {
        cleanupOwnership(directory);
        Process process;
        try {
            process = new ProcessBuilder(
                    arguments(
                            command,
                            directory,
                            timeout
                    )
            ).redirectOutput(ProcessBuilder.Redirect.DISCARD)
                    .redirectError(ProcessBuilder.Redirect.DISCARD)
                    .start();
        } catch (IOException exception) {
            LOGGER.warn("Supervisor process could not start");
            throw new TranscriptionException(
                    failureCode == null ? TranscriptionErrorCode.INFERENCE_FAILED : failureCode,
                    exception
            );
        }
        try {
            if (!process.waitFor(
                    timeout.toMillis() + 15_000,
                    TimeUnit.MILLISECONDS
            )) {
                stop(process);
                throw new TranscriptionException(timeoutCode);
            }
            if (process.exitValue() == 124) {
                throw new TranscriptionException(timeoutCode);
            }
            if (process.exitValue() != 0) {
                throw new TranscriptionException(failureCode == null ? readDiagnostic(directory) : failureCode);
            }
        } catch (InterruptedException exception) {
            stopAfterInterrupt(process);
            throw new TranscriptionException(
                    TranscriptionErrorCode.CANCELED,
                    exception
            );
        } finally {
            cleanupOwnership(directory);
        }
    }

    private List<String> arguments(
            List<String> command,
            Path directory,
            Duration timeout
    ) {
        List<String> arguments = new ArrayList<>(
                List.of(
                        properties.python(),
                        supervisor().toString(),
                        "--parent-pid",
                        Long.toString(
                                ProcessHandle.current()
                                        .pid()
                        ),
                        "--ownership",
                        directory.resolve("process-owner.json")
                                .toString(),
                        "--cwd",
                        properties.runnerDirectory()
                                .toString(),
                        "--deadline-seconds",
                        Long.toString(timeout.toSeconds()),
                        "--"
                )
        );
        arguments.addAll(command);
        return arguments;
    }

    private Path supervisor() {
        return properties.runnerDirectory()
                .resolve("scripts/serverSupervisor.py");
    }

    private void stop(Process process) throws InterruptedException {
        process.destroy();
        if (!process.waitFor(
                15,
                TimeUnit.SECONDS
        )) {
            process.destroyForcibly();
        }
    }

    private void stopAfterInterrupt(Process process) throws InterruptedException {
        process.destroy();
        if (!process.waitFor(
                15,
                TimeUnit.SECONDS
        )) {
            process.destroyForcibly();
            if (!process.waitFor(
                    5,
                    TimeUnit.SECONDS
            )) {
                markNotReady.run();
            }
        }
    }

    private TranscriptionErrorCode readDiagnostic(Path directory) {
        Path file = directory.resolve("diagnostic.json");
        if (!Files.isRegularFile(file)) {
            LOGGER.warn("Runner diagnostic is missing");
            return TranscriptionErrorCode.INFERENCE_FAILED;
        }
        try {
            JsonNode code = mapper.readTree(file.toFile())
                    .path("code");
            if (!code.isString()) {
                LOGGER.warn("Runner diagnostic has no text code");
                return TranscriptionErrorCode.INFERENCE_FAILED;
            }
            TranscriptionErrorCode diagnostic = switch (code.asString()) {
                case "CANCELLED" -> TranscriptionErrorCode.CANCELED;
                case "INFERENCE_TIMEOUT" -> TranscriptionErrorCode.INFERENCE_TIMEOUT;
                case "STT_FAILED" -> TranscriptionErrorCode.STT_FAILED;
                case "DIARIZATION_FAILED" -> TranscriptionErrorCode.DIARIZATION_FAILED;
                case "DIARIZATION_EMPTY" -> TranscriptionErrorCode.DIARIZATION_EMPTY;
                case "OUTPUT_LIMIT" -> TranscriptionErrorCode.OUTPUT_LIMIT;
                case "INVALID_MANIFEST" -> TranscriptionErrorCode.INVALID_MANIFEST;
                case "INVALID_ARGUMENTS" -> TranscriptionErrorCode.INVALID_ARGUMENTS;
                case "INVALID_RESULT" -> TranscriptionErrorCode.INVALID_RESULT;
                case "RUNNER_FAILED" -> TranscriptionErrorCode.RUNNER_FAILED;
                default -> TranscriptionErrorCode.INFERENCE_FAILED;
            };
            if (diagnostic == TranscriptionErrorCode.INFERENCE_FAILED) {
                LOGGER.warn("Runner diagnostic code is unsupported");
            }
            return diagnostic;
        } catch (RuntimeException exception) {
            LOGGER.warn("Runner diagnostic could not be parsed");
            throw new TranscriptionException(
                    TranscriptionErrorCode.INFERENCE_FAILED,
                    exception
            );
        }
    }
}
