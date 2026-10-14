package com.knot.backend.global.logging;

import static org.assertj.core.api.Assertions.assertThat;

import com.knot.backend.testsupport.TestApplicationProperties;
import com.knot.backend.testsupport.TestcontainersConfiguration;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Duration;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.testcontainers.Testcontainers;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.utility.MountableFile;
import org.testcontainers.images.builder.Transferable;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Tag("integration")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
@TestApplicationProperties
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@ExtendWith(OutputCaptureExtension.class)
@DirtiesContext
class RequestIdNginxIntegrationTest {
    private static final String CLIENT_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private static final String CONFIGURATION = """
            events {}
            http {
                include /etc/nginx/knot/access-log.conf;
                server {
                    listen 80;
                    access_log /dev/stdout knot_observability;
                    include /etc/nginx/knot/request-id-response.conf;
                    location / {
                        proxy_pass http://host.testcontainers.internal:%d;
                        proxy_set_header Host $host;
                        include /etc/nginx/knot/request-id-proxy.conf;
                    }
                    location = /proxy-unavailable {
                        proxy_pass http://127.0.0.1:1;
                        include /etc/nginx/knot/request-id-proxy.conf;
                    }
                }
            }
            """;

    @Value("${local.server.port}")
    private int serverPort;
    private GenericContainer<?> nginx;
    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeAll
    void startNginx() {
        Testcontainers.exposeHostPorts(serverPort);
        nginx = new GenericContainer<>("nginx:1.28-alpine").withExposedPorts(80)
                .withCopyToContainer(
                        Transferable.of(CONFIGURATION.formatted(serverPort)),
                        "/etc/nginx/nginx.conf"
                )
                .waitingFor(
                        Wait.forHttp("/actuator/health")
                                .forStatusCode(200)
                );
        copySnippet("access-log.conf");
        copySnippet("request-id-response.conf");
        copySnippet("request-id-proxy.conf");
        nginx.start();
    }

    @AfterAll
    void stopNginx() {
        if (nginx != null) {
            nginx.stop();
        }
    }

    @Test
    @DisplayName("실제 Nginx가 클라이언트 ID를 덮어쓰고 응답·Spring·JSON 로그를 같은 ID로 연결한다")
    void request_success_correlatesRealLogs(CapturedOutput output) throws Exception {
        // given
        HttpRequest request = HttpRequest.newBuilder(uri("/actuator/health"))
                .timeout(Duration.ofSeconds(10))
                .header(
                        "X-Request-ID",
                        CLIENT_ID
                )
                .header(
                        "X-Request-ID",
                        CLIENT_ID
                )
                .GET()
                .build();

        // when
        HttpResponse<String> response = client.send(
                request,
                HttpResponse.BodyHandlers.ofString()
        );

        // then
        assertThat(response.statusCode()).isEqualTo(200);
        String requestId = singleRequestId(response);
        assertThat(requestId).isNotEqualTo(CLIENT_ID);
        assertThat(output.getAll()).contains("request_id=" + requestId + " instance=");
        JsonNode log = nginxLog(requestId);
        assertThat(
                log.get("node")
                        .asText()
        ).isNotBlank();
        assertThat(
                log.get("upstream_addr")
                        .asText()
        ).contains(":" + serverPort);
        assertThat(
                log.get("upstream_status")
                        .asText()
        ).isEqualTo("200");
        assertThat(
                log.get("status")
                        .asInt()
        ).isEqualTo(200);
        assertThat(
                log.get("uri")
                        .asText()
        ).isEqualTo("/actuator/health");
        assertThat(
                singleRequestId(
                        send(
                                "/actuator/health",
                                "GET"
                        )
                )
        ).isNotEqualTo(requestId);
    }

    @Test
    @DisplayName("실제 Security의 인증 실패와 CSRF 실패도 응답과 두 서버 로그에 ID를 남긴다")
    void request_failure_securityRejection(CapturedOutput output) throws Exception {
        // when
        HttpResponse<String> unauthenticated = send(
                "/api/v1/request-id-probe",
                "GET"
        );
        HttpResponse<String> forbidden = send(
                "/api/v1/request-id-probe",
                "POST"
        );

        // then
        assertRejected(
                unauthenticated,
                401,
                output
        );
        assertRejected(
                forbidden,
                403,
                output
        );
    }

    @Test
    @DisplayName("Spring에 도달하지 못한 Nginx 502에도 단일 응답 ID와 접근 로그가 남는다")
    void request_failure_upstreamUnavailable() throws Exception {
        // when
        HttpResponse<String> response = send(
                "/proxy-unavailable",
                "GET"
        );

        // then
        assertThat(response.statusCode()).isEqualTo(502);
        JsonNode log = nginxLog(singleRequestId(response));
        assertThat(
                log.get("status")
                        .asInt()
        ).isEqualTo(502);
        assertThat(
                log.get("upstream_status")
                        .asText()
        ).isEqualTo("502");
    }

    @Test
    @DisplayName("Spring 직접 요청의 잘못된 ID를 교체하고 CORS에 노출한다")
    void request_success_directFallbackAndCors() throws Exception {
        // given
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + serverPort + "/actuator/health"))
                .timeout(Duration.ofSeconds(10))
                .header(
                        "X-Request-ID",
                        "untrusted"
                )
                .header(
                        "Origin",
                        "https://knoted.kr"
                )
                .GET()
                .build();

        // when
        HttpResponse<String> response = client.send(
                request,
                HttpResponse.BodyHandlers.ofString()
        );

        // then
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(singleRequestId(response)).isNotEqualTo("untrusted");
        assertThat(
                response.headers()
                        .firstValue("Access-Control-Expose-Headers")
        ).hasValue("Retry-After, X-Request-ID");
    }

    private void copySnippet(String name) {
        nginx.withCopyFileToContainer(
                MountableFile.forHostPath(
                        Path.of(
                                "ops/observability/nginx",
                                name
                        )
                                .toAbsolutePath()
                ),
                "/etc/nginx/knot/" + name
        );
    }

    private URI uri(String path) {
        return URI.create("http://" + nginx.getHost() + ":" + nginx.getMappedPort(80) + path);
    }

    private HttpResponse<String> send(
            String path,
            String method
    ) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(uri(path))
                .timeout(Duration.ofSeconds(10))
                .method(
                        method,
                        HttpRequest.BodyPublishers.noBody()
                )
                .build();
        return client.send(
                request,
                HttpResponse.BodyHandlers.ofString()
        );
    }

    private String singleRequestId(HttpResponse<String> response) {
        assertThat(
                response.headers()
                        .allValues("X-Request-ID")
        ).hasSize(1);
        String requestId = response.headers()
                .firstValue("X-Request-ID")
                .orElseThrow();
        assertThat(requestId).matches("[0-9a-f]{32}");
        return requestId;
    }

    private void assertRejected(
            HttpResponse<String> response,
            int status,
            CapturedOutput output
    ) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status);
        String requestId = singleRequestId(response);
        assertThat(output.getAll()).contains("request_id=" + requestId + " instance=");
        assertThat(
                nginxLog(requestId).get("status")
                        .asInt()
        ).isEqualTo(status);
    }

    private JsonNode nginxLog(String requestId) throws Exception {
        for (int attempt = 0; attempt < 50; attempt++) {
            String line = nginx.getLogs()
                    .lines()
                    .filter(value -> value.startsWith("{"))
                    .filter(value -> value.contains("\"request_id\":\"" + requestId + "\""))
                    .findFirst()
                    .orElse(null);
            if (line != null) {
                return mapper.readTree(line);
            }
            Thread.sleep(100);
        }
        throw new AssertionError("Nginx access log missing request ID " + requestId);
    }
}
