package com.knot.backend.search.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.knot.backend.document.DocumentFixtures;
import com.knot.backend.global.config.SearchAgentProperties;
import com.knot.backend.search.SearchMessageFixtures;
import com.knot.backend.search.application.dto.command.SearchQuestionCommand;
import com.knot.backend.search.application.dto.query.SearchDocumentParameters;
import com.knot.backend.search.application.dto.result.SearchAnswerWorkResult;
import com.knot.backend.search.application.dto.result.SearchDocumentPage;
import com.knot.backend.search.application.dto.result.SearchDocumentCard;
import com.knot.backend.search.infrastructure.SearchDocumentQueryAdapter;
import com.knot.backend.search.infrastructure.mcp.SearchToolTokenCodec;
import com.knot.backend.testsupport.TestApplicationProperties;
import com.knot.backend.testsupport.TestcontainersConfiguration;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.ObjectMapper;

@Tag("integration")
@ActiveProfiles("dev")
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@TestApplicationProperties
class SearchDocumentToolServiceIntegrationTest {
    private static final Instant NOW = Instant.parse("2026-10-11T00:00:00Z");

    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private ObjectMapper mapper;
    @Autowired
    private SearchQuestionIntakeService intake;
    @Autowired
    private SearchAnswerExecutionService executions;
    @Autowired
    private SearchToolAccess access;
    @Autowired
    private SearchDocumentQueryAdapter query;
    @MockitoBean
    private SearchGenerationAvailability availability;
    @MockitoBean
    private Clock clock;
    private DocumentFixtures fixtures;
    private SearchMessageFixtures messages;
    private SearchDocumentToolService service;
    private SearchToolScope scope;
    private long workspaceId;
    private long memberId;

    @BeforeEach
    void setUp() {
        when(clock.instant()).thenReturn(NOW);
        jdbc.sql("TRUNCATE TABLE members, workspaces RESTART IDENTITY CASCADE")
                .update();
        fixtures = new DocumentFixtures(jdbc);
        messages = new SearchMessageFixtures(jdbc);
        memberId = fixtures.saveMember("탐색자");
        workspaceId = fixtures.saveWorkspace();
        fixtures.join(
                workspaceId,
                memberId
        );
        long answerId = intake.acceptFirst(
                workspaceId,
                memberId,
                new SearchQuestionCommand(
                        "회의 결정",
                        UUID.randomUUID()
                )
        )
                .answerMessageId();
        SearchAnswerWorkResult work = executions.claim(answerId)
                .orElseThrow();
        scope = SearchToolScope.from(
                work,
                NOW,
                NOW.plusSeconds(120)
        );
        SearchAgentProperties properties = new SearchAgentProperties();
        properties.setSigningKey("test-signing-key-32-characters-minimum");
        service = new SearchDocumentToolService(
                query,
                access,
                new SearchToolTokenCodec(
                        mapper,
                        properties,
                        clock
                ),
                properties
        );
    }

    @Test
    @DisplayName("현재 Workspace의 보관 문서만 페이지를 이어서 열거한다")
    void list_success_archivedScopedPages() {
        long first = saveDocument(
                workspaceId,
                "ARCHIVED",
                "첫 회의",
                "내용"
        );
        long second = saveDocument(
                workspaceId,
                "ARCHIVED",
                "두 번째 회의",
                "내용"
        );
        saveDocument(
                workspaceId,
                "DRAFT",
                "준비 문서",
                "내용"
        );
        saveDocument(
                fixtures.saveWorkspace(),
                "ARCHIVED",
                "다른 공간",
                "내용"
        );
        SearchDocumentPage page = service.list(
                scope,
                parameters(
                        null,
                        null,
                        1
                )
        );
        assertThat(page.items()).extracting(SearchDocumentCard::documentId)
                .containsExactly(second);
        assertThat(page.nextCursor()).isNotNull();
        SearchDocumentPage previous = service.list(
                scope,
                parameters(
                        null,
                        page.nextCursor(),
                        1
                )
        );
        assertThat(previous.items()).extracting(SearchDocumentCard::documentId)
                .containsExactly(first);
        assertThat(previous.nextCursor()).isNull();
    }

    @Test
    @DisplayName("목록은 기간과 주제 조건을 적용하고 조건이 바뀐 커서를 거절한다")
    void list_failure_cursorFilterChanged() {
        saveDocument(
                workspaceId,
                "ARCHIVED",
                "첫",
                "내용"
        );
        saveDocument(
                workspaceId,
                "ARCHIVED",
                "둘",
                "내용"
        );
        SearchDocumentPage page = service.list(
                scope,
                parameters(
                        null,
                        null,
                        1
                )
        );
        SearchDocumentParameters changed = new SearchDocumentParameters(
                null,
                "다른 주제",
                null,
                null,
                page.nextCursor(),
                1
        );
        assertThatThrownBy(
                () -> service.list(
                        scope,
                        changed
                )
        ).hasMessage("INVALID_TOOL_ARGUMENTS");
        SearchDocumentParameters outside = new SearchDocumentParameters(
                null,
                null,
                NOW,
                NOW.plusSeconds(1),
                null,
                20
        );
        assertThat(
                service.list(
                        scope,
                        outside
                )
                        .items()
        ).isEmpty();
    }

    @Test
    @DisplayName("멤버가 탈퇴하면 현재 작업의 문서 목록도 읽을 수 없다")
    void list_failure_membershipRemoved() {
        jdbc.sql("DELETE FROM workspace_members WHERE workspace_id = :workspace AND member_id = :member")
                .param(
                        "workspace",
                        workspaceId
                )
                .param(
                        "member",
                        memberId
                )
                .update();
        assertThatThrownBy(
                () -> service.list(
                        scope,
                        parameters(
                                null,
                                null,
                                20
                        )
                )
        ).hasMessage("SEARCH_ACCESS_DENIED");
    }

    @Test
    @DisplayName("잘못된 크기와 시각 범위를 접수 전에 거절한다")
    void list_failure_invalidParameters() {
        assertThatThrownBy(
                () -> parameters(
                        null,
                        null,
                        0
                )
        ).hasMessage("INVALID_TOOL_ARGUMENTS");
        assertThatThrownBy(
                () -> new SearchDocumentParameters(
                        null,
                        null,
                        NOW,
                        NOW.minusSeconds(1),
                        null,
                        20
                )
        ).hasMessage("INVALID_TOOL_ARGUMENTS");
    }

    private SearchDocumentParameters parameters(
            String queryText,
            String cursor,
            int size
    ) {
        return new SearchDocumentParameters(
                queryText,
                null,
                null,
                null,
                cursor,
                size
        );
    }

    private long saveDocument(
            long workspace,
            String status,
            String title,
            String content
    ) {
        long id = messages.saveDocument(
                workspace,
                memberId
        );
        jdbc.sql(
                "UPDATE documents SET title = :title, content = :content, status = :status, archived_at = CASE WHEN :status = 'ARCHIVED' THEN created_at END WHERE id = :id"
        )
                .param(
                        "title",
                        title
                )
                .param(
                        "content",
                        content
                )
                .param(
                        "status",
                        status
                )
                .param(
                        "id",
                        id
                )
                .update();
        return id;
    }
}
