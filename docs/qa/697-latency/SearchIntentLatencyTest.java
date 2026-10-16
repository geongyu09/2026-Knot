package com.knot.backend.search.qa;

import static org.assertj.core.api.Assertions.assertThat;

import com.knot.backend.auth.domain.AuthTokenProvider;
import com.knot.backend.auth.domain.AuthenticatedMember;
import com.knot.backend.document.DocumentFixtures;
import com.knot.backend.global.config.JwtProperties;
import com.knot.backend.global.config.SearchAgentProperties;
import com.knot.backend.search.SearchMessageFixtures;
import com.knot.backend.search.application.SearchAnswerWorker;
import com.knot.backend.search.application.SearchGenerationAvailability;
import com.knot.backend.testsupport.TestApplicationProperties;
import com.knot.backend.testsupport.TestcontainersConfiguration;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.JsonNode;

@Tag("manual-live-model")
@ActiveProfiles("dev")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
@TestApplicationProperties
@Timeout(1200)
class SearchIntentLatencyTest {
    private static final String QUESTION = "지난 배포 회의에서 배포 담당자는 누구로 정했어?";

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
    private SearchAnswerWorker worker;
    @Autowired
    private SearchAgentProperties agent;
    @MockitoBean
    private SearchGenerationAvailability availability;

    @DynamicPropertySource
    static void liveProperties(DynamicPropertyRegistry registry) {
        registry.add(
                "knot.search.agent.enabled",
                () -> "true"
        );
        registry.add(
                "knot.search.worker.enabled",
                () -> "false"
        );
        registry.add(
                "knot.search.agent.signing-key",
                () -> "manual-latency-fixture-signing-key-0123456789"
        );
        registry.add(
                "knot.llm.enabled",
                () -> "true"
        );
        registry.add(
                "knot.llm.base-url",
                () -> "http://127.0.0.1:18997"
        );
        registry.add(
                "knot.llm.api-token",
                () -> System.getenv("KNOT_LLM_API_KEY")
        );
        registry.add(
                "knot.llm.model",
                () -> "qwen3.8-27b"
        );
    }

    @Test
    void joinsFactAcrossDeltaBoundaries() {
        String first = deltaText("event:delta\ndata:{\"text\":\"담당자는 흑\"}\n");
        String second = deltaText("event:delta\ndata:{\"text\":\"곰입니다.\"}\n");
        assertThat(first + second).isEqualTo("담당자는 흑곰입니다.");
    }

    @Test
    void compareFirstClientDelta() throws Exception {
        agent.setMcpBaseUrl(URI.create("http://127.0.0.1:" + port));
        jdbc.sql("TRUNCATE TABLE members, workspaces RESTART IDENTITY CASCADE")
                .update();
        DocumentFixtures fixtures = new DocumentFixtures(jdbc);
        long member = fixtures.saveMember("측정 사용자");
        long workspace = fixtures.saveWorkspace();
        fixtures.join(
                workspace,
                member
        );
        long document = new SearchMessageFixtures(jdbc).saveDocument(
                workspace,
                member
        );
        jdbc.sql("UPDATE documents SET title=:title, topic=:topic, content=:content WHERE id=:id")
                .param(
                        "title",
                        "배포 회의 결정"
                )
                .param(
                        "topic",
                        "배포"
                )
                .param(
                        "content",
                        "# 배포 회의\n배포 담당자는 흑곰으로 결정했다. 배포 날짜는 금요일이다."
                )
                .param(
                        "id",
                        document
                )
                .update();
        String access = jwt.getCookieName() + "=" + tokens.issue(
                AuthenticatedMember.of(
                        member,
                        "측정 사용자",
                        null
                )
        );
        try (HttpClient client = HttpClient.newHttpClient()) {
            HttpResponse<String> csrf = client.send(
                    HttpRequest.newBuilder(uri("/api/v1/auth/csrf"))
                            .GET()
                            .build(),
                    HttpResponse.BodyHandlers.ofString()
            );
            assertThat(csrf.statusCode()).isEqualTo(200);
            JsonNode body = json.readTree(csrf.body());
            JsonNode tokenNode = body.path("token");
            String token = tokenNode.asString();
            String cookie = csrf.headers()
                    .allValues("Set-Cookie")
                    .stream()
                    .filter(value -> value.startsWith("XSRF-TOKEN="))
                    .findFirst()
                    .orElseThrow()
                    .split(";")[0];
            int samples = Integer.parseInt(
                    System.getProperty(
                            "latency.samples",
                            "5"
                    )
            );
            for (int index = 0; index <= samples; index++) {
                measure(
                        client,
                        workspace,
                        access + "; " + cookie,
                        token,
                        index
                );
            }
        }
    }

    private void measure(
            HttpClient client,
            long workspace,
            String cookies,
            String csrf,
            int index
    ) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(uri("/api/v1/workspaces/" + workspace + "/search/conversations"))
                .header(
                        "Content-Type",
                        "application/json"
                )
                .header(
                        "Accept",
                        "text/event-stream"
                )
                .header(
                        "Cookie",
                        cookies
                )
                .header(
                        "X-XSRF-TOKEN",
                        csrf
                )
                .POST(
                        HttpRequest.BodyPublishers.ofString(
                                json.writeValueAsString(
                                        Map.of(
                                                "content",
                                                QUESTION,
                                                "requestId",
                                                UUID.randomUUID()
                                                        .toString()
                                        )
                                )
                        )
                )
                .build();
        long start = System.nanoTime();
        HttpResponse<InputStream> response = client.send(
                request,
                HttpResponse.BodyHandlers.ofInputStream()
        );
        assertThat(response.statusCode()).isEqualTo(200);
        long acceptedMs = -1;
        long deltaMs = -1;
        String terminal = "EOF";
        StringBuilder text = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(
                        response.body(),
                        StandardCharsets.UTF_8
                )
        ); ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            String event = readEvent(reader);
            assertThat(event).contains("event:accepted");
            acceptedMs = elapsed(start);
            long answer = jdbc.sql("SELECT max(id) FROM search_messages WHERE role='ASSISTANT'")
                    .query(Long.class)
                    .single();
            Future<?> task = executor.submit(() -> worker.execute(answer));
            for (String next = readEvent(reader); !next.isEmpty(); next = readEvent(reader)) {
                if (next.contains("event:delta") && deltaMs < 0) {
                    deltaMs = elapsed(start);
                }
                if (next.contains("event:delta")) {
                    text.append(deltaText(next));
                }
                if (next.contains("event:completed")) {
                    terminal = "COMPLETED";
                }
                if (next.contains("event:failed")) {
                    terminal = "FAILED";
                }
            }
            task.get(
                    150,
                    TimeUnit.SECONDS
            );
        }
        System.out.printf(
                "LATENCY_RESULT %s%n",
                json.writeValueAsString(
                        Map.of(
                                "variant",
                                System.getProperty("latency.variant"),
                                "sample",
                                index,
                                "acceptedMs",
                                acceptedMs,
                                "firstDeltaMs",
                                deltaMs,
                                "totalMs",
                                elapsed(start),
                                "terminal",
                                terminal,
                                "expectedFact",
                                text.toString()
                                        .contains("흑곰")
                        )
                )
        );
        assertThat(terminal).isEqualTo("COMPLETED");
        assertThat(deltaMs).isPositive();
        assertThat(text.toString()).contains("흑곰");
    }

    private String readEvent(BufferedReader reader) throws Exception {
        StringBuilder event = new StringBuilder();
        for (String line = reader.readLine(); line != null; line = reader.readLine()) {
            if (line.isEmpty() && !event.isEmpty()) {
                return event.toString();
            }
            event.append(line)
                    .append('\n');
        }
        return "";
    }

    private String deltaText(String event) {
        String data = event.lines()
                .filter(line -> line.startsWith("data:"))
                .findFirst()
                .orElseThrow()
                .substring(5);
        JsonNode body = json.readTree(data);
        JsonNode text = body.path("text");
        return text.asString();
    }

    private long elapsed(long start) {
        return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
    }

    private URI uri(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }
}
