package com.knot.backend.recording.infrastructure.transcription;

import com.knot.backend.global.config.TranscriptionProperties;
import com.knot.backend.recording.application.RecordingInputPreparationClient;
import com.knot.backend.recording.domain.RecordingErrorCode;
import com.knot.backend.recording.domain.RecordingException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
public class RecordingInputPreparationHttpClient implements RecordingInputPreparationClient {
    private static final String PATH = "/api/v1/audio-preparations";

    private final TranscriptionProperties properties;
    private final ObjectMapper mapper;
    private final HttpClient client;

    public RecordingInputPreparationHttpClient(
            TranscriptionProperties properties,
            ObjectMapper mapper
    ) {
        this.properties = properties;
        this.mapper = mapper;
        client = HttpClient.newBuilder()
                .connectTimeout(properties.enabled() ? properties.connectTimeout() : Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    public Snapshot get(UUID attemptId) {
        return read(
                request(PATH + "/" + attemptId).GET()
                        .build(),
                attemptId,
                200
        );
    }

    public Snapshot submit(
            UUID attemptId,
            String downloadUrl
    ) {
        String json = mapper.writeValueAsString(
                Map.of(
                        "attemptId",
                        attemptId.toString(),
                        "downloadUrl",
                        downloadUrl
                )
        );
        return read(
                request(PATH).header(
                        "Content-Type",
                        "application/json"
                )
                        .POST(HttpRequest.BodyPublishers.ofString(json))
                        .build(),
                attemptId,
                202
        );
    }

    public void download(
            UUID attemptId,
            Path destination,
            long byteLength
    ) {
        if (byteLength < 46 || byteLength > 230_400_044) {
            throw invalid();
        }
        CompletableFuture<HttpResponse<Path>> future = client.sendAsync(
                request(PATH + "/" + attemptId + "/audio").GET()
                        .build(),
                HttpResponse.BodyHandlers.limiting(
                        HttpResponse.BodyHandlers.ofFile(
                                destination,
                                StandardOpenOption.WRITE,
                                StandardOpenOption.TRUNCATE_EXISTING
                        ),
                        byteLength
                )
        );
        HttpResponse<Path> response = await(future);
        if (response.statusCode() != 200 || !response.headers()
                .firstValue("Content-Type")
                .map(value -> "audio/wav".equalsIgnoreCase(value.split(";")[0].trim()))
                .orElse(false) || response.headers()
                        .firstValueAsLong("Content-Length")
                        .orElse(-1) != byteLength) {
            throw invalid();
        }
    }

    private Snapshot read(
            HttpRequest request,
            UUID expectedId,
            int status
    ) {
        HttpResponse<String> response = await(
                client.sendAsync(
                        request,
                        HttpResponse.BodyHandlers.limiting(
                                HttpResponse.BodyHandlers.ofString(),
                                65_536
                        )
                )
        );
        if (response.statusCode() == 404) {
            throw new RecordingException(RecordingErrorCode.AI_JOB_NOT_FOUND);
        }
        if (response.statusCode() == 409) {
            throw new RecordingException(RecordingErrorCode.AI_BUSY);
        }
        if (response.statusCode() != status) {
            throw new RecordingException(RecordingErrorCode.AI_UNAVAILABLE);
        }
        try {
            Snapshot value = mapper.readerFor(Snapshot.class)
                    .with(tools.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                    .readValue(response.body());
            if (value == null || !expectedId.equals(value.attemptId()) || value.status() == null
                    || !java.util.Set.of(
                            "PROCESSING",
                            "SUCCEEDED",
                            "FAILED"
                    )
                            .contains(value.status())
                    || "SUCCEEDED".equals(value.status()) && value.result() == null || "FAILED".equals(
                            value.status()
                    ) && (value.failureCode() == null || !value.failureCode()
                            .matches("[A-Z0-9_]{1,100}"))) {
                throw invalid();
            }
            return value;
        } catch (tools.jackson.core.JacksonException exception) {
            throw new RecordingException(
                    RecordingErrorCode.AI_INVALID_RESPONSE,
                    exception
            );
        }
    }

    private HttpRequest.Builder request(String path) {
        return HttpRequest.newBuilder(
                properties.baseUrl()
                        .resolve(path)
        )
                .timeout(properties.requestTimeout())
                .header(
                        "Authorization",
                        "Bearer " + properties.token()
                );
    }

    private <T> HttpResponse<T> await(CompletableFuture<HttpResponse<T>> future) {
        try {
            return future.get(
                    properties.requestTimeout()
                            .toMillis(),
                    TimeUnit.MILLISECONDS
            );
        } catch (InterruptedException exception) {
            future.cancel(true);
            Thread.currentThread()
                    .interrupt();
            throw new RecordingException(
                    RecordingErrorCode.AI_UNAVAILABLE,
                    exception
            );
        } catch (java.util.concurrent.ExecutionException | java.util.concurrent.TimeoutException exception) {
            future.cancel(true);
            throw new RecordingException(
                    RecordingErrorCode.AI_UNAVAILABLE,
                    exception
            );
        }
    }

    private RecordingException invalid() {
        return new RecordingException(RecordingErrorCode.AI_INVALID_RESPONSE);
    }
}
