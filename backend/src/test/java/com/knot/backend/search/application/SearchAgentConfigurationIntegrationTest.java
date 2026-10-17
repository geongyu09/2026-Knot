package com.knot.backend.search.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import com.knot.backend.search.infrastructure.mcp.SearchMcpTools;
import com.knot.backend.testsupport.TestApplicationProperties;
import com.knot.backend.testsupport.TestcontainersConfiguration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

@Tag("integration")
@ActiveProfiles("dev")
@SpringBootTest(properties = {"knot.search.agent.enabled=true", "knot.search.worker.enabled=true",
        "knot.search.worker.poll-interval=PT1H", "knot.search.agent.signing-key=test-key-with-at-least-32-characters",
        "knot.llm.enabled=true", "knot.llm.base-url=http://127.0.0.1:9999", "knot.llm.api-token=test-token",
        "knot.llm.model=test-model"})
@Import(TestcontainersConfiguration.class)
@TestApplicationProperties
class SearchAgentConfigurationIntegrationTest {

    @Autowired
    private SearchGenerationAvailability availability;
    @Autowired
    private SearchDocumentRetriever retriever;
    @Autowired
    private SearchAnswerGenerator generator;
    @Autowired
    private SearchMcpTools tools;

    @Test
    @DisplayName("JPA와 실제 탐색 adapter 및 worker를 순환 의존 없이 함께 활성화한다")
    void startup_success_enabledAdaptersAndWorker() {
        assertThatNoException().isThrownBy(availability::requireAvailable);
        assertThat(retriever).isInstanceOf(com.knot.backend.search.infrastructure.llm.SearchMcpDocumentRetriever.class);
        assertThat(generator)
                .isInstanceOf(com.knot.backend.search.infrastructure.llm.SearchStreamingAnswerGenerator.class);
        assertThat(tools.definitions()).hasSize(3);
    }
}
