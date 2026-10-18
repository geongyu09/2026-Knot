package com.knot.backend.recording.infrastructure.transcription;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import com.knot.backend.global.config.TranscriptionProperties;
import com.knot.backend.recording.application.RecordingInputPreparationClient;
import com.knot.backend.recording.domain.RecordingException;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.ObjectMapper;

class RecordingInputPreparationHttpClientTest {
    private HttpServer server;
    private RecordingInputPreparationHttpClient client;
    @TempDir
    Path directory;

    @BeforeEach
    void setUp() throws Exception {
        server = HttpServer.create(
                new InetSocketAddress(
                        "127.0.0.1",
                        0
                ),
                0
        );
        server.start();
        client = new RecordingInputPreparationHttpClient(
                new TranscriptionProperties(
                        true,
                        URI.create(
                                "http://127.0.0.1:" + server.getAddress()
                                        .getPort()
                        ),
                        "test-token",
                        Duration.ofSeconds(1),
                        Duration.ofSeconds(2),
                        Duration.ofMillis(1),
                        Duration.ofMinutes(15)
                ),
                new ObjectMapper()
        );
    }

    @AfterEach
    void close() {
        server.stop(0);
    }

    @Test
    void submit_sendsAuthorizedAttemptAndDownloadUrl() {
        // given
        UUID attempt = UUID.randomUUID();
        AtomicReference<String> request = new AtomicReference<>();
        AtomicReference<String> authorization = new AtomicReference<>();
        server.createContext(
                "/api/v1/audio-preparations",
                exchange -> {
                    request.set(
                            new String(
                                    exchange.getRequestBody()
                                            .readAllBytes(),
                                    StandardCharsets.UTF_8
                            )
                    );
                    authorization.set(
                            exchange.getRequestHeaders()
                                    .getFirst("Authorization")
                    );
                    byte[] body = ("{\"attemptId\":\"" + attempt
                            + "\",\"status\":\"PROCESSING\",\"failureCode\":null,\"result\":null}")
                            .getBytes(StandardCharsets.UTF_8);
                    exchange.sendResponseHeaders(
                            202,
                            body.length
                    );
                    exchange.getResponseBody()
                            .write(body);
                    exchange.close();
                }
        );

        // when
        RecordingInputPreparationClient.Snapshot snapshot = client.submit(
                attempt,
                "http://source/exact-version"
        );

        // then
        assertThat(snapshot.attemptId()).isEqualTo(attempt);
        assertThat(snapshot.status()).isEqualTo("PROCESSING");
        assertThat(authorization.get()).isEqualTo("Bearer test-token");
        assertThat(request.get()).contains(
                attempt.toString(),
                "http://source/exact-version"
        );
    }

    @Test
    void get_rejectsAnotherAttemptResult() {
        // given
        UUID attempt = UUID.randomUUID();
        server.createContext(
                "/api/v1/audio-preparations/" + attempt,
                exchange -> {
                    byte[] body = ("{\"attemptId\":\"" + UUID.randomUUID() + "\",\"status\":\"PROCESSING\"}")
                            .getBytes(StandardCharsets.UTF_8);
                    exchange.sendResponseHeaders(
                            200,
                            body.length
                    );
                    exchange.getResponseBody()
                            .write(body);
                    exchange.close();
                }
        );

        // when
        Throwable failure = catchThrowable(() -> client.get(attempt));

        // then
        assertThat(failure).isInstanceOf(RecordingException.class);
    }

    @Test
    void download_acceptsAuthorizedExactLengthWav() throws Exception {
        // given
        UUID attempt = UUID.randomUUID();
        AtomicReference<String> authorization = new AtomicReference<>();
        server.createContext(
                "/api/v1/audio-preparations/" + attempt + "/audio",
                exchange -> {
                    authorization.set(
                            exchange.getRequestHeaders()
                                    .getFirst("Authorization")
                    );
                    exchange.getResponseHeaders()
                            .set(
                                    "Content-Type",
                                    "audio/wav"
                            );
                    byte[] body = new byte[48];
                    exchange.sendResponseHeaders(
                            200,
                            body.length
                    );
                    exchange.getResponseBody()
                            .write(body);
                    exchange.close();
                }
        );
        Path destination = Files.createFile(directory.resolve("input.tmp"));

        // when
        client.download(
                attempt,
                destination,
                48
        );

        // then
        assertThat(Files.size(destination)).isEqualTo(48);
        assertThat(authorization.get()).isEqualTo("Bearer test-token");
    }

    @Test
    void download_rejectsBodyExceedingExpectedCanonicalLength() throws Exception {
        // given
        UUID attempt = UUID.randomUUID();
        server.createContext(
                "/api/v1/audio-preparations/" + attempt + "/audio",
                exchange -> {
                    byte[] body = new byte[49];
                    exchange.sendResponseHeaders(
                            200,
                            body.length
                    );
                    exchange.getResponseBody()
                            .write(body);
                    exchange.close();
                }
        );
        Path destination = Files.createFile(directory.resolve("input.tmp"));

        // when
        Throwable failure = catchThrowable(
                () -> client.download(
                        attempt,
                        destination,
                        48
                )
        );

        // then
        assertThat(failure).isInstanceOf(RecordingException.class);
        assertThat(Files.size(destination)).isLessThanOrEqualTo(48);
    }
}
