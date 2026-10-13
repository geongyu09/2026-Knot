package com.knot.backend.recording.infrastructure.transcription;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import com.knot.backend.global.config.TranscriptionProperties;
import com.knot.backend.recording.application.dto.result.AiTranscriptionJob;
import com.knot.backend.recording.domain.TranscriptionErrorCode;
import com.knot.backend.recording.domain.TranscriptionException;
import com.knot.backend.testsupport.LlmHttpServer;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class AiTranscriptionHttpClientTest {
    private static final String PATH = "/api/v1/transcription-jobs";
    private static final UUID ID = UUID.fromString("019bbbc0-51ae-7000-8000-000000000001");

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    @DisplayName("접수 계약의 세 필드와 인증 헤더를 전송하며 HTTP 202와 작업 상태를 구분한다")
    void submit_success() throws Exception {
        // given
        try (LlmHttpServer server = new LlmHttpServer()) {
            AtomicReference<String> method = new AtomicReference<>();
            respond(
                    server,
                    202,
                    succeeded(),
                    method
            );
            AiTranscriptionHttpClient client = client(
                    server,
                    Duration.ofSeconds(2)
            );

            // when
            AiTranscriptionJob job = client.submit(
                    ID,
                    "https://audio.example/private?signature=secret",
                    2
            );

            // then
            assertThat(job.status()).isEqualTo(AiTranscriptionJob.Status.SUCCEEDED);
            assertThat(
                    job.result()
                            .utterances()
            ).hasSize(1);
            assertThat(method.get()).isEqualTo("POST");
            assertThat(server.authorization()).isEqualTo("Bearer test-secret");
            JsonNode request = mapper.readTree(server.requestBody());
            assertThat(request.size()).isEqualTo(3);
            assertThat(
                    request.path("attemptId")
                            .asString()
            ).isEqualTo(ID.toString());
            assertThat(
                    request.path("downloadUrl")
                            .asString()
            ).isEqualTo("https://audio.example/private?signature=secret");
            assertThat(
                    request.path("speakerCount")
                            .asInt()
            ).isEqualTo(2);
            assertThat(server.requestCount()).isEqualTo(1);
        }
    }

    @Test
    @DisplayName("선택적인 화자 수 없이 접수하고 진행 중 상태를 조회한다")
    void submit_success_optionalSpeaker() throws Exception {
        // given
        try (LlmHttpServer server = new LlmHttpServer()) {
            respond(
                    server,
                    202,
                    processing(),
                    new AtomicReference<>()
            );
            AiTranscriptionHttpClient client = client(
                    server,
                    Duration.ofSeconds(2)
            );

            // when
            AiTranscriptionJob job = client.submit(
                    ID,
                    "https://audio.example/file",
                    null
            );

            // then
            assertThat(job.status()).isEqualTo(AiTranscriptionJob.Status.PROCESSING);
            assertThat(
                    mapper.readTree(server.requestBody())
                            .has("speakerCount")
            ).isFalse();
        }
    }

    @Test
    @DisplayName("조회는 해당 작업 ID의 GET 주소와 HTTP 200을 사용한다")
    void get_success() throws Exception {
        // given
        try (LlmHttpServer server = new LlmHttpServer()) {
            AtomicReference<String> method = new AtomicReference<>();
            AtomicReference<String> path = new AtomicReference<>();
            server.respond(
                    PATH,
                    exchange -> {
                        method.set(exchange.getRequestMethod());
                        path.set(
                                exchange.getRequestURI()
                                        .getPath()
                        );
                        byte[] bytes = succeeded().getBytes(StandardCharsets.UTF_8);
                        exchange.sendResponseHeaders(
                                200,
                                bytes.length
                        );
                        exchange.getResponseBody()
                                .write(bytes);
                    }
            );
            AiTranscriptionHttpClient client = client(
                    server,
                    Duration.ofSeconds(2)
            );

            // when
            AiTranscriptionJob job = client.get(ID);

            // then
            assertThat(job.attemptId()).isEqualTo(ID);
            assertThat(
                    job.result()
                            .rawWhisperJson()
            ).isEqualTo("{\"transcription\":[]}");
            assertThat(method.get()).isEqualTo("GET");
            assertThat(path.get()).isEqualTo(PATH + "/" + ID);
            assertThat(server.authorization()).isEqualTo("Bearer test-secret");
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"STT_FAILED", "INFERENCE_TIMEOUT", "CANCELED",
            "untrusted response https://secret?token=secret"})
    @DisplayName("실패 작업은 알려진 코드만 보존하고 공급자 임의 문자열은 정적 코드로 대체한다")
    void get_success_failedJob(String failure) throws Exception {
        // given
        try (LlmHttpServer server = new LlmHttpServer()) {
            String body = "{\"attemptId\":\"" + ID + "\",\"status\":\"FAILED\",\"failureCode\":\"" + failure + "\"}";
            respond(
                    server,
                    200,
                    body,
                    new AtomicReference<>()
            );
            AiTranscriptionHttpClient client = client(
                    server,
                    Duration.ofSeconds(2)
            );

            // when
            AiTranscriptionJob job = client.get(ID);

            // then
            String expected = failure.startsWith("untrusted") ? "INFERENCE_FAILED" : failure;
            assertThat(job.status()).isEqualTo(AiTranscriptionJob.Status.FAILED);
            assertThat(job.failureCode()).isEqualTo(expected);
            assertThat(job.result()).isNull();
        }
    }

    @ParameterizedTest
    @CsvSource({"401, AI_AUTHENTICATION_FAILED", "403, AI_AUTHENTICATION_FAILED", "404, AI_JOB_NOT_FOUND",
            "409, AI_BUSY", "503, AI_NOT_READY", "500, AI_UNAVAILABLE", "400, AI_INVALID_RESPONSE",
            "302, AI_INVALID_RESPONSE", "202, AI_INVALID_RESPONSE"})
    @DisplayName("HTTP 오류를 정적 오류로 변환하며 재시도나 리다이렉트를 실행하지 않는다")
    void get_failure_status(
            int status,
            TranscriptionErrorCode expected
    ) throws Exception {
        // given
        try (LlmHttpServer server = new LlmHttpServer()) {
            respond(
                    server,
                    status,
                    "sensitive provider message",
                    new AtomicReference<>()
            );
            AiTranscriptionHttpClient client = client(
                    server,
                    Duration.ofSeconds(2)
            );

            // when
            Throwable thrown = catchThrowable(() -> client.get(ID));

            // then
            assertThat(thrown).isInstanceOf(TranscriptionException.class)
                    .satisfies(
                            exception -> assertThat(((TranscriptionException) exception).getErrorCode())
                                    .isEqualTo(expected)
                    )
                    .hasMessage(expected.getMessage());
            assertThat(server.requestCount()).isEqualTo(1);
        }
    }

    @Test
    @DisplayName("접수 응답은 HTTP 200을 202로 오인하지 않는다")
    void submit_failure_status200() throws Exception {
        // given
        try (LlmHttpServer server = new LlmHttpServer()) {
            respond(
                    server,
                    200,
                    processing(),
                    new AtomicReference<>()
            );
            AiTranscriptionHttpClient client = client(
                    server,
                    Duration.ofSeconds(2)
            );

            // when
            Throwable thrown = catchThrowable(
                    () -> client.submit(
                            ID,
                            "https://audio.example/file",
                            null
                    )
            );

            // then
            assertThat(thrown).hasMessage(TranscriptionErrorCode.AI_INVALID_RESPONSE.getMessage());
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"null", "[]", "{}", "not-json", "{\"attemptId\":\"wrong\",\"status\":\"PROCESSING\"}",
            "{\"status\":\"PROCESSING\",\"status\":\"FAILED\"}"})
    @DisplayName("잘못된 작업 응답과 중복 JSON 필드를 거절한다")
    void get_failure_invalidEnvelope(String body) throws Exception {
        // given
        try (LlmHttpServer server = new LlmHttpServer()) {
            respond(
                    server,
                    200,
                    body,
                    new AtomicReference<>()
            );
            AiTranscriptionHttpClient client = client(
                    server,
                    Duration.ofSeconds(2)
            );

            // when
            Throwable thrown = catchThrowable(() -> client.get(ID));

            // then
            assertThat(thrown).hasMessage(TranscriptionErrorCode.AI_INVALID_RESPONSE.getMessage());
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"trailing", "mismatchedId", "unknownStatus", "processingWithResult", "failedWithoutCode",
            "schema", "missingSchema", "raw", "rawDuplicate", "rawTrailing", "empty", "ord", "missingOrd", "speaker",
            "text", "negative", "reverse", "duration", "stringTime", "nonfinite", "unsorted"})
    @DisplayName("작업 상태와 결과 형태 및 전사 세그먼트 경계를 검증한다")
    void get_failure_invalidResult(String corruption) throws Exception {
        // given
        try (LlmHttpServer server = new LlmHttpServer()) {
            respond(
                    server,
                    200,
                    corrupt(corruption),
                    new AtomicReference<>()
            );
            AiTranscriptionHttpClient client = client(
                    server,
                    Duration.ofSeconds(2)
            );

            // when
            Throwable thrown = catchThrowable(() -> client.get(ID));

            // then
            assertThat(thrown).hasMessage(TranscriptionErrorCode.AI_INVALID_RESPONSE.getMessage());
        }
    }

    @Test
    @DisplayName("헤더 뒤 본문이 멈춰도 전체 응답 기한 안에 종료한다")
    void get_failure_stalledBody() throws Exception {
        // given
        CountDownLatch release = new CountDownLatch(1);
        try (LlmHttpServer server = new LlmHttpServer()) {
            server.respond(
                    PATH,
                    exchange -> {
                        exchange.sendResponseHeaders(
                                200,
                                0
                        );
                        exchange.getResponseBody()
                                .write('{');
                        exchange.getResponseBody()
                                .flush();
                        try {
                            release.await(
                                    5,
                                    TimeUnit.SECONDS
                            );
                        } catch (InterruptedException exception) {
                            Thread.currentThread()
                                    .interrupt();
                        }
                    }
            );
            AiTranscriptionHttpClient client = client(
                    server,
                    Duration.ofMillis(400)
            );

            // when
            Throwable thrown = catchThrowable(() -> client.get(ID));

            // then
            assertThat(thrown).hasMessage(TranscriptionErrorCode.AI_TIMEOUT.getMessage());
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("호출 중단 시 interrupt 표시와 원인을 보존한다")
    void get_failure_interrupted() throws Exception {
        // given
        try (LlmHttpServer server = new LlmHttpServer()) {
            respond(
                    server,
                    200,
                    processing(),
                    new AtomicReference<>()
            );
            AiTranscriptionHttpClient client = client(
                    server,
                    Duration.ofSeconds(2)
            );
            Thread.currentThread()
                    .interrupt();

            // when
            Throwable thrown = catchThrowable(() -> client.get(ID));

            // then
            assertThat(thrown).hasMessage(TranscriptionErrorCode.AI_INTERRUPTED.getMessage())
                    .hasCauseInstanceOf(InterruptedException.class);
            assertThat(
                    Thread.currentThread()
                            .isInterrupted()
            ).isTrue();
        } finally {
            Thread.interrupted();
        }
    }

    @Test
    @DisplayName("응답 바이트 한도를 넘는 Content-Length는 본문을 받기 전에 거절한다")
    void get_failure_bodyLimit() throws Exception {
        // given
        try (LlmHttpServer server = new LlmHttpServer()) {
            server.respond(
                    PATH,
                    exchange -> exchange.sendResponseHeaders(
                            200,
                            268_435_457L
                    )
            );
            AiTranscriptionHttpClient client = client(
                    server,
                    Duration.ofSeconds(2)
            );

            // when
            Throwable thrown = catchThrowable(() -> client.get(ID));

            // then
            assertThat(thrown).hasMessage(TranscriptionErrorCode.AI_UNAVAILABLE.getMessage());
        }
    }

    @Test
    @DisplayName("리다이렉트를 허용하는 HTTP 클라이언트 설정은 거절한다")
    void constructor_failure_redirects() throws Exception {
        // given
        try (LlmHttpServer server = new LlmHttpServer()) {
            HttpClient httpClient = HttpClient.newBuilder()
                    .followRedirects(HttpClient.Redirect.ALWAYS)
                    .build();
            TranscriptionProperties properties = properties(
                    server,
                    Duration.ofSeconds(2)
            );

            // when
            Throwable thrown = catchThrowable(
                    () -> new AiTranscriptionHttpClient(
                            httpClient,
                            mapper,
                            properties
                    )
            );

            // then
            assertThat(thrown).hasMessage(TranscriptionErrorCode.AI_INVALID_CONFIGURATION.getMessage());
        }
    }

    private String corrupt(String corruption) {
        String body = succeeded();
        return switch (corruption) {
            case "trailing" -> body + " {}";
            case "mismatchedId" -> body.replace(
                    ID.toString(),
                    UUID.randomUUID()
                            .toString()
            );
            case "unknownStatus" -> body.replace(
                    "SUCCEEDED",
                    "EXPIRED"
            );
            case "processingWithResult" -> body.replace(
                    "SUCCEEDED",
                    "PROCESSING"
            );
            case "failedWithoutCode" -> "{\"attemptId\":\"" + ID + "\",\"status\":\"FAILED\"}";
            case "schema" -> body.replace(
                    "\"schemaVersion\":1",
                    "\"schemaVersion\":2"
            );
            case "missingSchema" -> body.replace(
                    "\"schemaVersion\":1,",
                    ""
            );
            case "raw" -> body.replace(
                    "{\\\"transcription\\\":[]}",
                    "{}"
            );
            case "rawDuplicate" -> body.replace(
                    "{\\\"transcription\\\":[]}",
                    "{\\\"transcription\\\":[],\\\"transcription\\\":[]}"
            );
            case "rawTrailing" -> body.replace(
                    "{\\\"transcription\\\":[]}",
                    "{\\\"transcription\\\":[]} {}"
            );
            case "empty" -> body.replace(
                    utterance(),
                    ""
            );
            case "ord" -> body.replace(
                    "\"ord\":0",
                    "\"ord\":2"
            );
            case "missingOrd" -> body.replace(
                    "\"ord\":0,",
                    ""
            );
            case "speaker" -> body.replace(
                    "화자 1",
                    " "
            );
            case "text" -> body.replace(
                    "안녕하세요",
                    " "
            );
            case "negative" -> body.replace(
                    "\"startSec\":0.5",
                    "\"startSec\":-1"
            );
            case "reverse" -> body.replace(
                    "\"endSec\":1.5",
                    "\"endSec\":0.1"
            );
            case "duration" -> body.replace(
                    "\"endSec\":1.5",
                    "\"endSec\":7200.1"
            );
            case "stringTime" -> body.replace(
                    "\"startSec\":0.5",
                    "\"startSec\":\"0.5\""
            );
            case "nonfinite" -> body.replace(
                    "\"endSec\":1.5",
                    "\"endSec\":1e999"
            );
            case "unsorted" -> body.replace(
                    utterance(),
                    utterance() + "," + utterance().replace(
                            "\"ord\":0",
                            "\"ord\":1"
                    )
                            .replace(
                                    "\"startSec\":0.5",
                                    "\"startSec\":0.1"
                            )
            );
            default -> throw new IllegalArgumentException(corruption);
        };
    }

    private String utterance() {
        return "{\"ord\":0,\"speakerLabel\":\"화자 1\",\"startSec\":0.5,\"endSec\":1.5,\"text\":\"안녕하세요\"}";
    }
    private String succeeded() {
        return "{\"attemptId\":\"" + ID
                + "\",\"status\":\"SUCCEEDED\",\"failureCode\":null,\"result\":{\"schemaVersion\":1,"
                + "\"rawWhisperJson\":\"{\\\"transcription\\\":[]}\",\"utterances\":[" + utterance() + "]}}";
    }
    private String processing() {
        return "{\"attemptId\":\"" + ID + "\",\"status\":\"PROCESSING\"}";
    }
    private void respond(
            LlmHttpServer server,
            int status,
            String body,
            AtomicReference<String> method
    ) {
        server.respond(
                PATH,
                exchange -> {
                    method.set(exchange.getRequestMethod());
                    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                    exchange.sendResponseHeaders(
                            status,
                            bytes.length
                    );
                    exchange.getResponseBody()
                            .write(bytes);
                }
        );
    }
    private AiTranscriptionHttpClient client(
            LlmHttpServer server,
            Duration timeout
    ) {
        return new AiTranscriptionHttpClient(
                HttpClient.newHttpClient(),
                mapper,
                properties(
                        server,
                        timeout
                )
        );
    }
    private TranscriptionProperties properties(
            LlmHttpServer server,
            Duration timeout
    ) {
        return new TranscriptionProperties(
                true,
                server.baseUrl(),
                "test-secret",
                Duration.ofSeconds(1),
                timeout,
                Duration.ofSeconds(2),
                Duration.ofHours(12)
        );
    }
}
