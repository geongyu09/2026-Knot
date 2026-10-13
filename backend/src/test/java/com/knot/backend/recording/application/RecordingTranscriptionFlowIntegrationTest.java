package com.knot.backend.recording.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;

import com.knot.backend.document.DocumentFixtures;
import com.knot.backend.recording.application.dto.result.RecordingDetailResult;
import com.knot.backend.recording.application.dto.result.RecordingAudioUploadCompletionResult;
import com.knot.backend.recording.application.dto.result.RecordingTranscriptionRetryResult;
import com.knot.backend.recording.application.dto.result.StoredAudioObject;
import com.knot.backend.recording.domain.RecordingAudioUpload;
import com.knot.backend.recording.domain.RecordingAudioUploadRepository;
import com.knot.backend.recording.domain.RecordingAudioUploadStatus;
import com.knot.backend.recording.domain.TranscriptionStatus;
import com.knot.backend.testsupport.LlmHttpServer;
import com.knot.backend.testsupport.TestApplicationProperties;
import com.knot.backend.testsupport.TestcontainersConfiguration;
import com.sun.net.httpserver.HttpExchange;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

@Tag("integration")
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@TestApplicationProperties
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class RecordingTranscriptionFlowIntegrationTest {
    private static final Instant NOW = DocumentFixtures.CREATED_AT.plusSeconds(120);
    private static final String RAW = "{\"transcription\":[{\"text\":\"회의 발언\"}]}";
    private static final String PATH = "/api/v1/transcription-jobs";
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final List<UUID> SUBMITTED = new CopyOnWriteArrayList<>();
    private static final AtomicBoolean GET_NOT_FOUND = new AtomicBoolean();
    private static final AtomicBoolean VALID_AUTHORIZATION = new AtomicBoolean(true);
    private static final AtomicBoolean PREVIOUS_SAVED_BEFORE_SECOND_POST = new AtomicBoolean();
    private static final AtomicReference<JdbcClient> DATABASE = new AtomicReference<>();
    private static final LlmHttpServer SERVER = startServer();

    @Autowired
    private RecordingAudioUploadCompletionService completion;
    @Autowired
    private RecordingTranscriptionService worker;
    @Autowired
    private RecordingTranscriptionStateService state;
    @Autowired
    private RecordingDetailService details;
    @Autowired
    private RecordingAudioUploadRepository uploads;
    @Autowired
    private TransactionTemplate transactions;
    @Autowired
    private JdbcClient jdbc;
    @MockitoBean
    private RecordingAudioStorage storage;
    @MockitoBean
    private Clock clock;
    private DocumentFixtures fixtures;
    private long workspaceId;
    private long memberId;

    @DynamicPropertySource
    static void transcriptionProperties(DynamicPropertyRegistry registry) {
        registry.add(
                "knot.transcription.enabled",
                () -> true
        );
        registry.add(
                "knot.transcription.base-url",
                () -> SERVER.baseUrl()
                        .toString()
        );
        registry.add(
                "knot.transcription.token",
                () -> "test-token"
        );
        registry.add(
                "knot.transcription.poll-interval",
                () -> "PT0.01S"
        );
        registry.add(
                "knot.transcription.request-timeout",
                () -> "PT2S"
        );
    }

    @BeforeEach
    void setUp() {
        when(clock.instant()).thenReturn(NOW);
        when(storage.findStoredObject(any())).thenReturn(
                StoredAudioObject.of(
                        1024,
                        "audio/webm"
                )
        );
        when(
                storage.presignDownload(
                        any(),
                        any(),
                        anyLong()
                )
        ).thenReturn("https://immutable.example/audio.webm?versionId=fixture");
        jdbc.sql("TRUNCATE TABLE members, workspaces RESTART IDENTITY CASCADE")
                .update();
        fixtures = new DocumentFixtures(jdbc);
        workspaceId = fixtures.saveWorkspace();
        memberId = fixtures.saveMember("녹음자");
        fixtures.join(
                workspaceId,
                memberId
        );
        SUBMITTED.clear();
        GET_NOT_FOUND.set(false);
        VALID_AUTHORIZATION.set(true);
        PREVIOUS_SAVED_BEFORE_SECOND_POST.set(false);
        DATABASE.set(jdbc);
    }

    @AfterEach
    void stopWorkerBeforeDatabaseShutdown() {
        worker.close();
    }

    @AfterAll
    static void stopHttpServer() {
        SERVER.close();
    }

    @Test
    @DisplayName("실제 HTTP 연동으로 전사와 문서 접수를 저장한 뒤 다음 녹음을 전사하며 완료 통지를 중복 처리하지 않는다")
    void complete_success_sequentialHttpAndPersistence() throws Exception {
        // given
        Upload first = reserveUpload();
        completion.complete(
                workspaceId,
                memberId,
                first.recordingId(),
                first.uploadId()
        );
        awaitStatus(
                first.recordingId(),
                TranscriptionStatus.SUCCEEDED
        );
        UUID firstAttempt = state.find(first.recordingId())
                .attemptId();
        completion.complete(
                workspaceId,
                memberId,
                first.recordingId(),
                first.uploadId()
        );
        assertThat(SUBMITTED).containsExactly(firstAttempt);
        Upload second = reserveUpload();

        // when
        completion.complete(
                workspaceId,
                memberId,
                second.recordingId(),
                second.uploadId()
        );

        // then
        awaitStatus(
                second.recordingId(),
                TranscriptionStatus.SUCCEEDED
        );
        assertThat(PREVIOUS_SAVED_BEFORE_SECOND_POST).isTrue();
        assertThat(VALID_AUTHORIZATION).isTrue();
        assertThat(SUBMITTED).containsExactly(
                firstAttempt,
                state.find(second.recordingId())
                        .attemptId()
        );
        assertThat(
                jdbc.sql("SELECT content FROM transcripts ORDER BY id")
                        .query(String.class)
                        .list()
        ).containsExactly(
                RAW,
                RAW
        );
        assertThat(
                jdbc.sql("SELECT text FROM transcript_segments ORDER BY transcript_id, position")
                        .query(String.class)
                        .list()
        ).containsExactly(
                "첫 발언",
                "다른 발언",
                "첫 발언",
                "다른 발언"
        );
        assertThat(
                jdbc.sql("SELECT start_millis FROM transcript_segments ORDER BY transcript_id, position")
                        .query(Long.class)
                        .list()
        ).containsExactly(
                125L,
                1000L,
                125L,
                1000L
        );
        assertThat(count("document_generation_batches")).isEqualTo(2);
        assertThat(
                jdbc.sql("SELECT stage FROM document_generation_jobs ORDER BY id")
                        .query(String.class)
                        .list()
        ).containsExactly(
                "CLASSIFICATION",
                "CLASSIFICATION"
        );
        RecordingDetailResult detail = details.find(
                workspaceId,
                memberId,
                second.recordingId()
        );
        assertThat(detail.audioUploadStatus()).isEqualTo(RecordingAudioUploadStatus.COMPLETED);
        assertThat(detail.transcriptionStatus()).isEqualTo(TranscriptionStatus.SUCCEEDED);
        assertThat(detail.transcriptionAttemptId()).isEqualTo(SUBMITTED.get(1));
        assertThat(detail.transcriptionFailureCode()).isNull();
    }

    @Test
    @DisplayName("AI 재시작으로 작업이 사라지면 실패를 노출하고 사용자 재시도는 새 ID로 결과와 문서 접수를 한 번 저장한다")
    void retry_success_missingAiJob() throws Exception {
        // given
        GET_NOT_FOUND.set(true);
        Upload upload = reserveUpload();
        completion.complete(
                workspaceId,
                memberId,
                upload.recordingId(),
                upload.uploadId()
        );
        awaitStatus(
                upload.recordingId(),
                TranscriptionStatus.FAILED
        );
        UUID previousAttempt = state.find(upload.recordingId())
                .attemptId();
        assertThat(
                details.find(
                        workspaceId,
                        memberId,
                        upload.recordingId()
                )
                        .transcriptionFailureCode()
        ).isEqualTo("AI_JOB_NOT_FOUND");
        assertThat(count("transcripts")).isZero();
        GET_NOT_FOUND.set(false);

        // when
        RecordingTranscriptionRetryResult retry = worker.retry(
                workspaceId,
                memberId,
                upload.recordingId()
        );

        // then
        awaitStatus(
                upload.recordingId(),
                TranscriptionStatus.SUCCEEDED
        );
        assertThat(retry.attemptId()).isNotEqualTo(previousAttempt);
        assertThat(SUBMITTED).containsExactly(
                previousAttempt,
                retry.attemptId()
        );
        assertThat(count("transcripts")).isEqualTo(1);
        assertThat(count("transcript_segments")).isEqualTo(2);
        assertThat(count("document_generation_batches")).isEqualTo(1);
        assertThat(count("document_generation_jobs")).isEqualTo(1);
        assertThat(
                details.find(
                        workspaceId,
                        memberId,
                        upload.recordingId()
                )
                        .transcriptionFailureCode()
        ).isNull();
    }

    @Test
    @DisplayName("전사 접수 전 삭제된 오디오의 완료 통지는 전사를 새로 만들지 않는다")
    void repeatedCompletionDoesNotTranscribeDeletedAudio() {
        // given
        Upload upload = reserveUpload();
        transactions.executeWithoutResult(status -> {
            RecordingAudioUpload audio = uploads.findById(upload.uploadId())
                    .orElseThrow();
            audio.complete(
                    1024,
                    "audio/webm",
                    NOW
            );
            audio.recordDeleted(NOW);
        });

        // when
        RecordingAudioUploadCompletionResult result = completion.complete(
                workspaceId,
                memberId,
                upload.recordingId(),
                upload.uploadId()
        );

        // then
        assertThat(result.uploadStatus()).isEqualTo(RecordingAudioUploadStatus.COMPLETED);
        assertThat(state.find(upload.recordingId())).isNull();
        assertThat(SUBMITTED).isEmpty();
    }

    private Upload reserveUpload() {
        long recording = fixtures.saveRecording(
                workspaceId,
                memberId,
                30_000
        );
        long upload = transactions.execute(
                status -> uploads.save(
                        RecordingAudioUpload.reserve(
                                recording,
                                "recordings/" + recording + "/audio.webm",
                                "audio/webm",
                                1024,
                                NOW.minusSeconds(10)
                        )
                )
                        .getId()
        );
        return new Upload(
                recording,
                upload
        );
    }

    private void awaitStatus(
            long recordingId,
            TranscriptionStatus status
    ) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            if (state.find(recordingId) != null && state.find(recordingId)
                    .status() == status) {
                return;
            }
            Thread.sleep(10);
        }
        assertThat(
                state.find(recordingId)
                        .status()
        ).isEqualTo(status);
    }

    private long count(String table) {
        return jdbc.sql("SELECT count(*) FROM " + table)
                .query(Long.class)
                .single();
    }

    private static LlmHttpServer startServer() {
        try {
            LlmHttpServer server = new LlmHttpServer();
            server.respond(
                    PATH,
                    RecordingTranscriptionFlowIntegrationTest::respond
            );
            return server;
        } catch (IOException exception) {
            throw new ExceptionInInitializerError(exception);
        }
    }

    private static void respond(HttpExchange exchange) throws IOException {
        if (!"Bearer test-token".equals(
                exchange.getRequestHeaders()
                        .getFirst("Authorization")
        )) {
            VALID_AUTHORIZATION.set(false);
        }
        if ("POST".equals(exchange.getRequestMethod())) {
            JsonNode request = MAPPER.readTree(SERVER.requestBody());
            UUID attempt = UUID.fromString(
                    request.path("attemptId")
                            .asString()
            );
            SUBMITTED.add(attempt);
            if (SUBMITTED.size() == 2) {
                PREVIOUS_SAVED_BEFORE_SECOND_POST.set(
                        DATABASE.get()
                                .sql("SELECT count(*) FROM recording_transcriptions WHERE status = 'SUCCEEDED'")
                                .query(Long.class)
                                .single() == 1
                );
            }
            send(
                    exchange,
                    202,
                    MAPPER.createObjectNode()
                            .put(
                                    "attemptId",
                                    attempt.toString()
                            )
                            .put(
                                    "status",
                                    "PROCESSING"
                            )
            );
            return;
        }
        if (GET_NOT_FOUND.get()) {
            send(
                    exchange,
                    404,
                    MAPPER.createObjectNode()
                            .put(
                                    "code",
                                    "JOB_NOT_FOUND"
                            )
            );
            return;
        }
        String path = exchange.getRequestURI()
                .getPath();
        String attempt = path.substring((PATH + "/").length());
        ObjectNode body = MAPPER.createObjectNode()
                .put(
                        "attemptId",
                        attempt
                )
                .put(
                        "status",
                        "SUCCEEDED"
                );
        ObjectNode result = body.putObject("result")
                .put(
                        "schemaVersion",
                        1
                )
                .put(
                        "rawWhisperJson",
                        RAW
                );
        result.set(
                "utterances",
                MAPPER.readTree("""
                        [{"ord":0,"speakerLabel":"speaker-A","startSec":0.125,"endSec":0.8,"text":"첫 발언"},
                         {"ord":1,"speakerLabel":"speaker-B","startSec":1,"endSec":1.5,"text":"다른 발언"}]
                        """)
        );
        send(
                exchange,
                200,
                body
        );
    }

    private static void send(
            HttpExchange exchange,
            int status,
            JsonNode body
    ) throws IOException {
        byte[] bytes = MAPPER.writeValueAsString(body)
                .getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders()
                .set(
                        "Content-Type",
                        "application/json"
                );
        exchange.sendResponseHeaders(
                status,
                bytes.length
        );
        exchange.getResponseBody()
                .write(bytes);
    }

    private record Upload(
            long recordingId,
            long uploadId
    ) {
    }
}
