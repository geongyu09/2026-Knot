package com.knot.backend.recording.infrastructure.transcription;

import com.knot.backend.global.config.TranscriptionProperties;
import com.knot.backend.recording.application.TranscriptionClient;
import com.knot.backend.recording.application.dto.result.AiTranscript;
import com.knot.backend.recording.application.dto.result.AiTranscriptionJob;
import com.knot.backend.recording.domain.TranscriptionErrorCode;
import com.knot.backend.recording.domain.TranscriptionException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import tools.jackson.core.JacksonException;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

public final class AiTranscriptionHttpClient implements TranscriptionClient {
    private static final String JOB_PATH = "/api/v1/transcription-jobs";
    private static final long MAX_RESPONSE_BYTES = 268_435_456L;
    private static final Set<String> FAILURE_CODES = Set.of(
            "BUSY",
            "NOT_READY",
            "JOB_NOT_FOUND",
            "EXECUTOR_REJECTED",
            "INFERENCE_FAILED",
            "CANCELED",
            "INVALID_RESULT",
            "AUDIO_DURATION_EXCEEDED",
            "INVALID_AUDIO_FORMAT",
            "INVALID_PROFILE",
            "MISSING_RUNTIME",
            "PROCESS_CLEANUP_FAILED",
            "UNOWNED_WORK_DIRECTORY",
            "DECODE_TIMEOUT",
            "INFERENCE_TIMEOUT",
            "DECODE_FAILED",
            "AUDIO_TOO_LARGE",
            "DOWNLOAD_FAILED",
            "DOWNLOAD_TIMEOUT",
            "INCOMPLETE_DOWNLOAD",
            "INVALID_AUDIO_METADATA",
            "INVALID_DOWNLOAD_URL",
            "STT_FAILED",
            "DIARIZATION_FAILED",
            "DIARIZATION_EMPTY",
            "OUTPUT_LIMIT",
            "INVALID_MANIFEST",
            "INVALID_ARGUMENTS",
            "RUNNER_FAILED"
    );
    private final HttpClient httpClient;
    private final ObjectMapper mapper;
    private final TranscriptionProperties properties;

    public AiTranscriptionHttpClient(
            HttpClient httpClient,
            ObjectMapper mapper,
            TranscriptionProperties properties
    ) {
        properties.validateEnabledConfiguration();
        if (httpClient.followRedirects() != HttpClient.Redirect.NEVER) {
            throw new TranscriptionException(TranscriptionErrorCode.AI_INVALID_CONFIGURATION);
        }
        this.httpClient = httpClient;
        this.mapper = mapper.rebuild()
                .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .build();
        this.properties = properties;
    }

    @Override
    public AiTranscriptionJob submit(
            UUID attemptId,
            String downloadUrl,
            Integer speakerCount
    ) {
        ObjectNode body = mapper.createObjectNode();
        body.put(
                "attemptId",
                attemptId.toString()
        );
        body.put(
                "downloadUrl",
                downloadUrl
        );
        if (speakerCount != null) {
            body.put(
                    "speakerCount",
                    speakerCount
            );
        }
        HttpRequest request = request(JOB_PATH).header(
                "Content-Type",
                "application/json"
        )
                .POST(
                        HttpRequest.BodyPublishers.ofString(
                                mapper.writeValueAsString(body),
                                StandardCharsets.UTF_8
                        )
                )
                .build();
        return readJob(
                awaitResponse(
                        request,
                        202
                ),
                attemptId
        );
    }

    @Override
    public AiTranscriptionJob get(UUID attemptId) {
        HttpRequest request = request(JOB_PATH + "/" + attemptId).GET()
                .build();
        return readJob(
                awaitResponse(
                        request,
                        200
                ),
                attemptId
        );
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
                )
                .header(
                        "Accept",
                        "application/json"
                );
    }

    private String awaitResponse(
            HttpRequest request,
            int expectedStatus
    ) {
        CompletableFuture<HttpResponse<String>> future = httpClient.sendAsync(
                request,
                HttpResponse.BodyHandlers.limiting(
                        HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8),
                        MAX_RESPONSE_BYTES
                )
        );
        try {
            HttpResponse<String> response = future.get(
                    properties.requestTimeout()
                            .toMillis(),
                    TimeUnit.MILLISECONDS
            );
            if (response.statusCode() != expectedStatus) {
                throw httpFailure(response.statusCode());
            }
            return response.body();
        } catch (TimeoutException exception) {
            future.cancel(true);
            throw new TranscriptionException(
                    TranscriptionErrorCode.AI_TIMEOUT,
                    exception
            );
        } catch (InterruptedException exception) {
            future.cancel(true);
            Thread.currentThread()
                    .interrupt();
            throw new TranscriptionException(
                    TranscriptionErrorCode.AI_INTERRUPTED,
                    exception
            );
        } catch (ExecutionException exception) {
            TranscriptionErrorCode code = exception.getCause() instanceof HttpTimeoutException
                    ? TranscriptionErrorCode.AI_TIMEOUT
                    : TranscriptionErrorCode.AI_UNAVAILABLE;
            throw new TranscriptionException(
                    code,
                    exception
            );
        }
    }

    private TranscriptionException httpFailure(int status) {
        TranscriptionErrorCode code = switch (status) {
            case 401, 403 -> TranscriptionErrorCode.AI_AUTHENTICATION_FAILED;
            case 404 -> TranscriptionErrorCode.AI_JOB_NOT_FOUND;
            case 409 -> TranscriptionErrorCode.AI_BUSY;
            case 503 -> TranscriptionErrorCode.AI_NOT_READY;
            default ->
                status >= 500 ? TranscriptionErrorCode.AI_UNAVAILABLE : TranscriptionErrorCode.AI_INVALID_RESPONSE;
        };
        return new TranscriptionException(code);
    }

    private AiTranscriptionJob readJob(
            String body,
            UUID expectedId
    ) {
        try {
            JsonNode root = mapper.readTree(body);
            require(root != null && root.isObject());
            require(
                    text(root.path("attemptId")) && expectedId.toString()
                            .equals(
                                    root.path("attemptId")
                                            .asString()
                            )
            );
            JsonNode status = root.path("status");
            require(text(status));
            AiTranscriptionJob.Status jobStatus = AiTranscriptionJob.Status.valueOf(status.asString());
            JsonNode result = root.path("result");
            JsonNode failure = root.path("failureCode");
            if (jobStatus == AiTranscriptionJob.Status.PROCESSING) {
                require(absent(result) && absent(failure));
                return new AiTranscriptionJob(
                        expectedId,
                        jobStatus,
                        null,
                        null
                );
            }
            if (jobStatus == AiTranscriptionJob.Status.FAILED) {
                require(absent(result) && text(failure));
                String failureCode = FAILURE_CODES.contains(failure.asString())
                        ? failure.asString()
                        : "INFERENCE_FAILED";
                return new AiTranscriptionJob(
                        expectedId,
                        jobStatus,
                        failureCode,
                        null
                );
            }
            require(absent(failure));
            return new AiTranscriptionJob(
                    expectedId,
                    jobStatus,
                    null,
                    readTranscript(result)
            );
        } catch (JacksonException | IllegalArgumentException exception) {
            throw new TranscriptionException(
                    TranscriptionErrorCode.AI_INVALID_RESPONSE,
                    exception
            );
        }
    }

    private AiTranscript readTranscript(JsonNode result) {
        require(result.isObject());
        JsonNode schema = result.path("schemaVersion");
        require(schema.isIntegralNumber() && schema.canConvertToInt() && schema.asInt() == 1);
        JsonNode raw = result.path("rawWhisperJson");
        require(text(raw));
        JsonNode whisper = mapper.readTree(raw.asString());
        require(
                whisper != null && whisper.isObject() && whisper.path("transcription")
                        .isArray()
        );
        JsonNode items = result.path("utterances");
        require(items.isArray() && !items.isEmpty());
        List<AiTranscript.Utterance> utterances = new ArrayList<>(items.size());
        double previousStart = -1;
        for (int index = 0; index < items.size(); index++) {
            JsonNode item = items.get(index);
            JsonNode ord = item.path("ord");
            JsonNode speaker = item.path("speakerLabel");
            JsonNode start = item.path("startSec");
            JsonNode end = item.path("endSec");
            JsonNode words = item.path("text");
            require(
                    item.isObject() && ord.isIntegralNumber() && ord.canConvertToInt() && ord.asInt() == index
                            && text(speaker) && text(words) && start.isNumber() && end.isNumber()
            );
            double startSec = start.asDouble();
            double endSec = end.asDouble();
            require(
                    Double.isFinite(startSec) && Double.isFinite(endSec) && startSec >= 0 && endSec >= startSec
                            && endSec <= 7200 && startSec >= previousStart
            );
            utterances.add(
                    new AiTranscript.Utterance(
                            index,
                            speaker.asString(),
                            startSec,
                            endSec,
                            words.asString()
                    )
            );
            previousStart = startSec;
        }
        return new AiTranscript(
                1,
                raw.asString(),
                utterances
        );
    }

    private boolean text(JsonNode node) {
        return node.isString() && !node.asString()
                .isBlank();
    }
    private boolean absent(JsonNode node) {
        return node.isMissingNode() || node.isNull();
    }
    private void require(boolean valid) {
        if (!valid) {
            throw new TranscriptionException(TranscriptionErrorCode.AI_INVALID_RESPONSE);
        }
    }
}
