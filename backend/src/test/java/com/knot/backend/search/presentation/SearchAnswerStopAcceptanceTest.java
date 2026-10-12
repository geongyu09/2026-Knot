package com.knot.backend.search.presentation;

import tools.jackson.databind.JsonNode;
import java.util.stream.Collectors;
import static org.assertj.core.api.Assertions.assertThat;

import com.knot.backend.auth.domain.AuthTokenProvider;
import com.knot.backend.auth.domain.AuthenticatedMember;
import com.knot.backend.document.DocumentFixtures;
import com.knot.backend.global.config.JwtProperties;
import com.knot.backend.search.application.SearchAnswerExecutionService;
import com.knot.backend.search.application.SearchGenerationAvailability;
import com.knot.backend.search.application.SearchQuestionIntakeService;
import com.knot.backend.search.application.dto.command.SearchQuestionCommand;
import com.knot.backend.search.application.dto.result.SearchQuestionAcceptedResult;
import com.knot.backend.testsupport.TestApplicationProperties;
import com.knot.backend.testsupport.TestcontainersConfiguration;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.json.JsonMapper;

@Tag("acceptance")
@ActiveProfiles("dev")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "knot.search.worker.stream-heartbeat-interval=30ms", "knot.search.worker.stream-timeout=3s"})
@Import(TestcontainersConfiguration.class)
@TestApplicationProperties
@Timeout(30)
class SearchAnswerStopAcceptanceTest {

    @LocalServerPort
    private int port;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private AuthTokenProvider tokens;
    @Autowired
    private JwtProperties jwt;
    @Autowired
    private JsonMapper json;
    @Autowired
    private SearchQuestionIntakeService intake;
    @Autowired
    private SearchAnswerExecutionService executions;
    @MockitoBean
    private SearchGenerationAvailability availability;
    private final HttpClient client = HttpClient.newHttpClient();
    private long workspaceId;
    private long memberId;
    private String csrfCookie;
    private String csrfToken;
    private DocumentFixtures fixtures;
    private SearchQuestionAcceptedResult accepted;

    @BeforeEach
    void setUp() throws Exception {
        jdbc.sql("TRUNCATE TABLE members, workspaces RESTART IDENTITY CASCADE")
                .update();
        fixtures = new DocumentFixtures(jdbc);
        memberId = fixtures.saveMember("중지 사용자");
        workspaceId = fixtures.saveWorkspace();
        fixtures.join(
                workspaceId,
                memberId
        );
        accepted = intake.acceptFirst(
                workspaceId,
                memberId,
                new SearchQuestionCommand(
                        "질문",
                        UUID.randomUUID()
                )
        );
        HttpResponse<String> csrf = client.send(
                HttpRequest.newBuilder(uri("/api/v1/auth/csrf"))
                        .GET()
                        .build(),
                HttpResponse.BodyHandlers.ofString()
        );
        assertThat(csrf.statusCode()).isEqualTo(200);
        csrfCookie = csrf.headers()
                .firstValue("Set-Cookie")
                .orElseThrow()
                .split(
                        ";",
                        2
                )[0];
        csrfToken = csrfCookie.substring(csrfCookie.indexOf('=') + 1);
    }

    @Test
    @DisplayName("본문 없는 실제 POST는 부분 본문과 STOPPED를 반환하고 중복 요청도 같다")
    void stop_success_partialAndDuplicate() throws Exception {
        UUID token = executions.claim(accepted.answerMessageId())
                .orElseThrow()
                .token();
        executions.append(
                accepted.answerMessageId(),
                token,
                "부분 😀\n본문"
        );
        HttpResponse<String> response = stop(
                cookie(memberId),
                path(),
                csrfToken
        );
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(
                json.readTree(response.body())
                        .path("answerId")
                        .asLong()
        ).isEqualTo(accepted.answerMessageId());
        assertThat(
                json.readTree(response.body())
                        .path("status")
                        .asString()
        ).isEqualTo("STOPPED");
        assertThat(
                json.readTree(response.body())
                        .path("content")
                        .asString()
        ).isEqualTo("부분 😀\n본문");
        assertThat(
                stop(
                        cookie(memberId),
                        path(),
                        csrfToken
                ).body()
        ).isEqualTo(response.body());
    }

    @ParameterizedTest
    @ValueSource(strings = {"COMPLETED", "FAILED"})
    @DisplayName("종료된 답변 중지는 실제 HTTP 409 ANSWER_NOT_RUNNING이다")
    void stop_failure_terminalAnswer(String status) throws Exception {
        jdbc.sql("UPDATE search_messages SET status=:status, content='보존' WHERE id=:id")
                .param(
                        "status",
                        status
                )
                .param(
                        "id",
                        accepted.answerMessageId()
                )
                .update();
        assertError(
                stop(
                        cookie(memberId),
                        path(),
                        csrfToken
                ),
                409,
                "ANSWER_NOT_RUNNING"
        );
    }

    @Test
    @DisplayName("로그인·CSRF·소유권·멤버십·역할을 실제 Security 필터에서 검증한다")
    void stop_failure_securityAndScope() throws Exception {
        assertError(
                stop(
                        "",
                        path(),
                        csrfToken
                ),
                401,
                "UNAUTHENTICATED"
        );
        assertError(
                stop(
                        cookie(memberId),
                        path(),
                        "invalid-token"
                ),
                403,
                "FORBIDDEN"
        );
        long other = fixtures.saveMember("다른 사용자");
        fixtures.join(
                workspaceId,
                other
        );
        assertError(
                stop(
                        cookie(other),
                        path(),
                        csrfToken
                ),
                403,
                "SEARCH_ACCESS_DENIED"
        );
        assertError(
                stop(
                        cookie(memberId),
                        path().replace(
                                "/answers/" + accepted.answerMessageId(),
                                "/answers/" + accepted.questionMessageId()
                        ),
                        csrfToken
                ),
                404,
                "ANSWER_NOT_FOUND"
        );
        assertError(
                stop(
                        cookie(memberId),
                        path().replace(
                                "/answers/" + accepted.answerMessageId(),
                                "/answers/999999"
                        ),
                        csrfToken
                ),
                404,
                "ANSWER_NOT_FOUND"
        );
        jdbc.sql("DELETE FROM workspace_members")
                .update();
        assertError(
                stop(
                        cookie(memberId),
                        path(),
                        csrfToken
                ),
                403,
                "SEARCH_ACCESS_DENIED"
        );
    }

    @Test
    @DisplayName("재연결 SSE의 마지막 부분 본문과 stopped는 중지 HTTP 응답과 일치한다")
    void stop_success_reconnectSseAndRecordingPreserved() throws Exception {
        long recording = fixtures.saveRecording(
                workspaceId,
                memberId,
                0
        );
        jdbc.sql(
                "UPDATE recording_sessions SET status='RECORDING', ended_at=NULL, current_interval_started_at=started_at WHERE id=:id"
        )
                .param(
                        "id",
                        recording
                )
                .update();
        String recordingBefore = jdbc.sql("SELECT row_to_json(r)::text FROM recording_sessions r WHERE id=:id")
                .param(
                        "id",
                        recording
                )
                .query(String.class)
                .single();
        UUID token = executions.claim(accepted.answerMessageId())
                .orElseThrow()
                .token();
        executions.append(
                accepted.answerMessageId(),
                token,
                "첫 부분"
        );
        HttpResponse<InputStream> stream = client.send(
                HttpRequest.newBuilder(
                        uri(
                                path().replace(
                                        "/stop",
                                        "/events"
                                )
                        )
                )
                        .header(
                                "Cookie",
                                cookie(memberId)
                        )
                        .header(
                                "Accept",
                                "text/event-stream"
                        )
                        .GET()
                        .build(),
                HttpResponse.BodyHandlers.ofInputStream()
        );
        assertThat(stream.statusCode()).isEqualTo(200);
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(
                        stream.body(),
                        StandardCharsets.UTF_8
                )
        )) {
            String snapshot = frame(reader);
            assertThat(snapshot).contains(
                    "event:snapshot",
                    "첫 부분"
            );
            executions.append(
                    accepted.answerMessageId(),
                    token,
                    " 추가"
            );
            HttpResponse<String> stopped = stop(
                    cookie(memberId),
                    path(),
                    csrfToken
            );
            assertThat(stopped.statusCode()).isEqualTo(200);
            assertThat(
                    json.readTree(stopped.body())
                            .path("content")
                            .asString()
            ).isEqualTo("첫 부분 추가");
            String remaining = reader.lines()
                    .collect(Collectors.joining("\n"));
            assertThat(remaining).contains(
                    "event:delta",
                    " 추가",
                    "event:stopped",
                    "\"answerId\":" + accepted.answerMessageId()
            );
            assertThat(remaining).doesNotContain(
                    "event:completed",
                    "event:failed"
            );
        }
        assertThat(
                jdbc.sql("SELECT row_to_json(r)::text FROM recording_sessions r WHERE id=:id")
                        .param(
                                "id",
                                recording
                        )
                        .query(String.class)
                        .single()
        ).isEqualTo(recordingBefore);
    }

    @Test
    @DisplayName("최초 생성 SSE도 accepted와 부분 출력 뒤 stopped로 종료한다")
    void stop_success_firstQuestionSse() throws Exception {
        String create = "/api/v1/workspaces/" + workspaceId + "/search/conversations";
        HttpResponse<InputStream> stream = client.send(
                HttpRequest.newBuilder(uri(create))
                        .header(
                                "Cookie",
                                cookie(memberId) + "; " + csrfCookie
                        )
                        .header(
                                "X-XSRF-TOKEN",
                                csrfToken
                        )
                        .header(
                                "Content-Type",
                                "application/json"
                        )
                        .header(
                                "Accept",
                                "text/event-stream"
                        )
                        .POST(
                                HttpRequest.BodyPublishers
                                        .ofString("{\"content\":\"첫 질문\",\"requestId\":\"" + UUID.randomUUID() + "\"}")
                        )
                        .build(),
                HttpResponse.BodyHandlers.ofInputStream()
        );
        assertThat(stream.statusCode()).isEqualTo(200);
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(
                        stream.body(),
                        StandardCharsets.UTF_8
                )
        )) {
            String event = frame(reader);
            assertThat(event).contains("event:accepted");
            JsonNode data = SearchSseEventPayload.read(
                    event,
                    json
            );
            long answer = data.path("answerMessageId")
                    .asLong();
            long conversation = data.path("conversationId")
                    .asLong();
            UUID token = executions.claim(answer)
                    .orElseThrow()
                    .token();
            executions.append(
                    answer,
                    token,
                    "첫 답변 부분"
            );
            HttpResponse<String> stopped = stop(
                    cookie(memberId),
                    create + "/" + conversation + "/answers/" + answer + "/stop",
                    csrfToken
            );
            assertThat(stopped.statusCode()).isEqualTo(200);
            String remaining = reader.lines()
                    .collect(Collectors.joining("\n"));
            assertThat(remaining).contains(
                    "첫 답변 부분",
                    "event:stopped",
                    "\"answerMessageId\":" + answer
            );
        }
    }

    private String frame(BufferedReader reader) throws Exception {
        StringBuilder event = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            if (line.isEmpty()) {
                return event.toString();
            }
            event.append(line)
                    .append('\n');
        }
        throw new IllegalStateException("SSE ended before event");
    }

    private HttpResponse<String> stop(
            String access,
            String path,
            String token
    ) throws Exception {
        return client.send(
                HttpRequest.newBuilder(uri(path))
                        .timeout(Duration.ofSeconds(5))
                        .header(
                                "Cookie",
                                access + "; " + csrfCookie
                        )
                        .header(
                                "X-XSRF-TOKEN",
                                token
                        )
                        .header(
                                "Content-Type",
                                "application/json"
                        )
                        .POST(HttpRequest.BodyPublishers.noBody())
                        .build(),
                HttpResponse.BodyHandlers.ofString()
        );
    }

    private void assertError(
            HttpResponse<String> response,
            int status,
            String code
    ) {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(
                json.readTree(response.body())
                        .path("code")
                        .asString()
        ).isEqualTo(code);
    }

    private URI uri(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }

    private String path() {
        return "/api/v1/workspaces/" + workspaceId + "/search/conversations/" + accepted.conversationId() + "/answers/"
                + accepted.answerMessageId() + "/stop";
    }

    private String cookie(long member) {
        return jwt.getCookieName() + "=" + tokens.issue(
                AuthenticatedMember.of(
                        member,
                        "멤버",
                        null
                )
        );
    }
}
