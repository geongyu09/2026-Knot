package com.knot.backend.document.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.knot.backend.document.DocumentFixtures;
import com.knot.backend.document.application.DocumentGenerationInputQuery;
import com.knot.backend.document.application.DocumentGenerationIntakeService;
import com.knot.backend.document.application.DocumentGenerationJobRetryService;
import com.knot.backend.document.application.DocumentGenerationWorker;
import com.knot.backend.global.exception.LlmErrorCode;
import com.knot.backend.global.exception.LlmException;
import com.knot.backend.global.infrastructure.llm.LlmClient;
import com.knot.backend.global.infrastructure.llm.LlmCompletionRequest;
import com.knot.backend.testsupport.TestApplicationProperties;
import com.knot.backend.testsupport.TestcontainersConfiguration;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

@Tag("integration")
@ActiveProfiles("dev")
@SpringBootTest(properties = {"knot.llm.enabled=true", "knot.llm.base-url=http://localhost:1234",
        "knot.llm.api-token=test-token", "knot.llm.model=test-model", "knot.document-generation.worker.enabled=false"})
@Import(TestcontainersConfiguration.class)
@TestApplicationProperties
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class DocumentTranscriptInputIntegrationTest {
    private static final String TEXT = "검색 조건을 정합니다.\n다음 주에 개발합니다.";

    @Autowired
    private DocumentGenerationIntakeService intake;
    @Autowired
    private DocumentGenerationWorker worker;
    @Autowired
    private DocumentGenerationInputQuery inputs;
    @Autowired
    private DocumentGenerationJobRetryService retries;
    @Autowired
    private TransactionTemplate transactions;
    @Autowired
    private JdbcClient jdbc;
    @MockitoBean
    private Clock clock;
    @MockitoBean
    private LlmClient client;
    private final ObjectMapper mapper = new ObjectMapper();
    private final List<LlmCompletionRequest> requests = new ArrayList<>();
    private long workspaceId;
    private long memberId;
    private long transcriptId;
    private long classificationId;

    @BeforeEach
    void setUp() {
        when(clock.instant()).thenReturn(DocumentFixtures.CREATED_AT.plusSeconds(120));
        jdbc.sql("TRUNCATE TABLE members, workspaces RESTART IDENTITY CASCADE")
                .update();
        DocumentFixtures fixtures = new DocumentFixtures(jdbc);
        memberId = fixtures.saveMember("녹음자");
        workspaceId = fixtures.saveWorkspace();
        fixtures.join(
                workspaceId,
                memberId
        );
        long recordingId = fixtures.saveRecording(
                workspaceId,
                memberId,
                89000
        );
        transcriptId = fixtures.saveTranscript(recordingId);
        classificationId = transactions.execute(
                status -> intake.acceptCompletedTranscript(
                        workspaceId,
                        recordingId,
                        transcriptId
                )
        )
                .classificationJobId();
        requests.clear();
        doAnswer(invocation -> respond(invocation.getArgument(0))).when(client)
                .complete(any());
    }

    @Test
    @DisplayName("구간 행이 없는 과거 Whisper 원문에서도 발화만 읽고 저장된 JSON을 보존한다")
    void findForUpdate_success_extractsLegacyRawJsonWithoutSegments() {
        // given
        String raw = largeWhisperJson();
        store(raw);
        // when
        String result = transactions.execute(
                status -> inputs.findForUpdate(
                        workspaceId,
                        transcriptId
                )
                        .orElseThrow()
                        .content()
        );
        // then
        assertThat(result).isEqualTo(TEXT);
        assertThat(storedContent()).isEqualTo(raw);
        assertThat(
                jdbc.sql("SELECT count(*) FROM transcript_segments")
                        .query(Long.class)
                        .single()
        ).isZero();
    }

    @Test
    @DisplayName("분류와 생성 및 사용자 재시도 모두 발화만 모델에 전달하고 원본을 보존한다")
    void execute_success_sameTextAcrossClassificationGenerationAndRetry() {
        // given
        String raw = largeWhisperJson();
        store(raw);
        worker.execute(
                workspaceId,
                classificationId
        );
        long generationId = jdbc.sql("SELECT id FROM document_generation_jobs WHERE stage = 'GENERATION'")
                .query(Long.class)
                .single();
        doAnswer(invocation -> {
            requests.add(invocation.getArgument(0));
            throw new LlmException(LlmErrorCode.LLM_AUTHENTICATION_FAILED);
        }).when(client)
                .complete(any());
        worker.execute(
                workspaceId,
                generationId
        );
        retries.retry(
                workspaceId,
                memberId,
                generationId
        );
        doAnswer(invocation -> respond(invocation.getArgument(0))).when(client)
                .complete(any());
        // when
        worker.execute(
                workspaceId,
                generationId
        );
        // then
        assertThat(requests).extracting(LlmCompletionRequest::schemaName)
                .containsExactly(
                        "document_topics",
                        "document_generation",
                        "document_generation"
                );
        assertThat(requests).allSatisfy(request -> assertThat(transcriptText(request)).isEqualTo(TEXT));
        assertThat(storedContent()).isEqualTo(raw);
        assertThat(
                jdbc.sql("SELECT count(*) FROM documents")
                        .query(Long.class)
                        .single()
        ).isEqualTo(1);
        assertThat(
                jdbc.sql("SELECT user_retry_count FROM document_generation_jobs WHERE stage = 'GENERATION'")
                        .query(Integer.class)
                        .single()
        ).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"  기존 발화\n둘째 문장  ", " {\"text\":\"일반 JSON\"} ", " {잘못된 JSON을 말했습니다"})
    @DisplayName("기존 텍스트와 일반 JSON 및 JSON처럼 보이는 발화는 원문 그대로 전달한다")
    void findForUpdate_success_preservesExistingText(String original) {
        // given
        store(original);
        // when
        String result = transactions.execute(
                status -> inputs.findForUpdate(
                        workspaceId,
                        transcriptId
                )
                        .orElseThrow()
                        .content()
        );
        // then
        assertThat(result).isEqualTo(original);
        assertThat(storedContent()).isEqualTo(original);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{\"transcription\":[]}", "{\"transcription\":[{\"text\":\"  \"}]}"})
    @DisplayName("이미 접수된 작업의 유효한 빈 발화는 기존 입력 오류로 종료한다")
    void execute_failure_emptyUtterancesInPreviouslyAcceptedJob(String raw) {
        // given
        store(raw);
        // when
        worker.execute(
                workspaceId,
                classificationId
        );
        // then
        assertThat(
                jdbc.sql("SELECT failure_cause FROM document_generation_jobs WHERE stage = 'CLASSIFICATION'")
                        .query(String.class)
                        .single()
        ).isEqualTo("INVALID_INPUT");
        assertThat(storedContent()).isEqualTo(raw);
        verifyNoInteractions(client);
    }

    @ParameterizedTest
    @MethodSource("newTranscriptCases")
    @DisplayName("신규 전사 접수는 발화 변환과 빈 발화 정책 및 미지원 원문의 기존 경로를 유지한다")
    void acceptCompletedTranscript_success_preservesNewTranscriptCompatibility(
            String raw,
            String expectedText,
            boolean empty
    ) {
        // given
        DocumentFixtures fixtures = new DocumentFixtures(jdbc);
        long recordingId = fixtures.saveRecording(
                workspaceId,
                memberId,
                89000
        );
        transcriptId = fixtures.saveTranscript(recordingId);
        store(raw);
        // when
        transactions.executeWithoutResult(
                status -> intake.acceptCompletedTranscript(
                        workspaceId,
                        recordingId,
                        transcriptId
                )
        );
        // then
        assertThat(storedContent()).isEqualTo(raw);
        assertThat(
                transactions.<String>execute(
                        status -> inputs.findForUpdate(
                                workspaceId,
                                transcriptId
                        )
                                .orElseThrow()
                                .content()
                )
        ).isEqualTo(expectedText);
        assertThat(
                jdbc.sql("SELECT topic_registration_state FROM document_generation_batches WHERE transcript_id = :id")
                        .param(
                                "id",
                                transcriptId
                        )
                        .query(String.class)
                        .single()
        ).isEqualTo(empty ? "NO_CONTENT" : "WAITING_CLASSIFICATION");
        assertThat(
                jdbc.sql("""
                        SELECT count(*) FROM document_generation_jobs
                        WHERE transcript_id = :id AND stage = 'CLASSIFICATION' AND status = 'QUEUED'
                        """)
                        .param(
                                "id",
                                transcriptId
                        )
                        .query(Long.class)
                        .single()
        ).isEqualTo(empty ? 0L : 1L);
        assertThat(
                jdbc.sql("""
                        SELECT count(*) FROM document_generation_batch_topics t
                        JOIN document_generation_batches b ON b.id = t.batch_id
                        WHERE b.transcript_id = :id
                        """)
                        .param(
                                "id",
                                transcriptId
                        )
                        .query(Long.class)
                        .single()
        ).isZero();
        verifyNoInteractions(client);
    }

    private static Stream<Arguments> newTranscriptCases() {
        List<String> unsupported = List.of(
                "{\"transcription\":[{}]}",
                "{\"transcription\":[{\"text\":null}]}",
                "{\"transcription\":[{\"text\":123}]}",
                "{\"model\":{},\"params\":{},\"transcription\":null}",
                "{\"model\":{},\"params\":{},\"transcription\":{}}"
        );
        return Stream.concat(
                Stream.of(
                        Arguments.of(
                                largeWhisperJson(),
                                TEXT,
                                false
                        ),
                        Arguments.of(
                                "{\"transcription\":[{\"text\":\"최소 발화\"}]}",
                                "최소 발화",
                                false
                        ),
                        Arguments.of(
                                "{\"transcription\":[]}",
                                "",
                                true
                        ),
                        Arguments.of(
                                "{\"transcription\":[{\"text\":\"　 \"},{\"text\":\"\"}]}",
                                "　 \n",
                                true
                        )
                ),
                unsupported.stream()
                        .map(
                                raw -> Arguments.of(
                                        raw,
                                        raw,
                                        false
                                )
                        )
        );
    }

    private String respond(LlmCompletionRequest request) {
        requests.add(request);
        if (request.schemaName()
                .equals("document_topics")) {
            return "{\"topics\":[\"검색\"]}";
        }
        return "{\"title\":\"검색\",\"summary\":null,\"content\":\"## 핵심 요약\\n검색 조건을 정하고 다음 주에 개발합니다.\"}";
    }

    private String transcriptText(LlmCompletionRequest request) {
        return mapper.readTree(
                request.messages()
                        .get(1)
                        .content()
        )
                .path("transcriptText")
                .asString();
    }

    private static String largeWhisperJson() {
        return "{\"model\":{\"type\":\"large-v3\",\"details\":\"" + "metadata".repeat(8000)
                + "\"},\"params\":{},\"transcription\":[{\"text\":\"검색 조건을 정합니다.\","
                + "\"offsets\":{\"from\":1000,\"to\":2000},\"tokens\":[{\"text\":\"제외\"}]},"
                + "{\"text\":\"다음 주에 개발합니다.\",\"offsets\":{\"from\":0,\"to\":1000}}]}";
    }

    private void store(String content) {
        jdbc.sql("UPDATE transcripts SET content = :content WHERE id = :id")
                .param(
                        "content",
                        content
                )
                .param(
                        "id",
                        transcriptId
                )
                .update();
    }

    private String storedContent() {
        return jdbc.sql("SELECT content FROM transcripts WHERE id = :id")
                .param(
                        "id",
                        transcriptId
                )
                .query(String.class)
                .single();
    }
}
