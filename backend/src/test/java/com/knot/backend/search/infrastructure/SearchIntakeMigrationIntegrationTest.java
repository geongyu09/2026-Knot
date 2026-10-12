package com.knot.backend.search.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.knot.backend.document.DocumentFixtures;
import com.knot.backend.search.SearchFixtures;
import java.sql.Connection;
import java.sql.DriverManager;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Tag("integration")
@Testcontainers
class SearchIntakeMigrationIntegrationTest {

    @Container
    private static final PostgreSQLContainer POSTGRESQL = new PostgreSQLContainer("pgvector/pgvector:pg18");

    @BeforeEach
    void setUp() {
        flyway("40").clean();
        flyway("40").migrate();
    }

    @Test
    @DisplayName("V40에서 저장한 실패 답변과 부분 본문을 V41·V42 적용 뒤 보존한다")
    void migrate_success_preservesExistingMessages() throws Exception {
        try (Connection connection = connection()) {
            JdbcClient jdbc = jdbc(connection);
            DocumentFixtures fixtures = new DocumentFixtures(jdbc);
            long member = fixtures.saveMember("질문자");
            long workspace = fixtures.saveWorkspace();
            long conversation = new SearchFixtures(jdbc).saveConversation(
                    workspace,
                    member,
                    "질문",
                    "부분 😀"
            );
            jdbc.sql("UPDATE search_messages SET status = 'FAILED' WHERE role = 'ASSISTANT'")
                    .update();
            assertThat(flyway("42").migrate().migrationsExecuted).isEqualTo(2);
            assertThat(
                    jdbc.sql("SELECT content FROM search_messages WHERE role = 'ASSISTANT' AND conversation_id = :id")
                            .param(
                                    "id",
                                    conversation
                            )
                            .query(String.class)
                            .single()
            ).isEqualTo("부분 😀");
            assertThat(
                    jdbc.sql("SELECT failure_code IS NULL FROM search_messages WHERE role = 'ASSISTANT'")
                            .query(Boolean.class)
                            .single()
            ).isTrue();
            assertThat(
                    jdbc.sql("SELECT COUNT(*) FROM search_request_receipts")
                            .query(Long.class)
                            .single()
            ).isZero();
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"UPDATE search_answer_executions SET state = 'RUNNING'",
            "UPDATE search_answer_executions SET excluded_count = -1",
            "UPDATE search_messages SET failure_code = 'ERROR' WHERE role = 'USER'"})
    @DisplayName("실행 token·기한 조합과 음수 제외 수 및 USER 오류 코드는 PostgreSQL CHECK로 거절한다")
    void migrate_failure_enforcesExecutionConstraints(String invalidSql) throws Exception {
        flyway("42").migrate();
        try (Connection connection = connection()) {
            JdbcClient jdbc = jdbc(connection);
            DocumentFixtures fixtures = new DocumentFixtures(jdbc);
            long member = fixtures.saveMember("질문자");
            long workspace = fixtures.saveWorkspace();
            long conversation = new SearchFixtures(jdbc).saveConversation(
                    workspace,
                    member,
                    "질문",
                    "부분"
            );
            long question = jdbc.sql("SELECT id FROM search_messages WHERE role = 'USER'")
                    .query(Long.class)
                    .single();
            long answer = jdbc.sql("SELECT id FROM search_messages WHERE role = 'ASSISTANT'")
                    .query(Long.class)
                    .single();
            jdbc.sql("""
                    INSERT INTO search_answer_executions(answer_id, conversation_id, question_id, state, created_at)
                    VALUES (:answer, :conversation, :question, 'QUEUED', CURRENT_TIMESTAMP)
                    """)
                    .param(
                            "answer",
                            answer
                    )
                    .param(
                            "conversation",
                            conversation
                    )
                    .param(
                            "question",
                            question
                    )
                    .update();
            assertThatThrownBy(
                    () -> jdbc.sql(invalidSql)
                            .update()
            ).isInstanceOf(DataIntegrityViolationException.class);
        }
    }

    private Flyway flyway(String target) {
        return Flyway.configure()
                .dataSource(
                        POSTGRESQL.getJdbcUrl(),
                        POSTGRESQL.getUsername(),
                        POSTGRESQL.getPassword()
                )
                .locations("classpath:db/migration")
                .target(target)
                .cleanDisabled(false)
                .load();
    }

    private Connection connection() throws Exception {
        return DriverManager.getConnection(
                POSTGRESQL.getJdbcUrl(),
                POSTGRESQL.getUsername(),
                POSTGRESQL.getPassword()
        );
    }

    private JdbcClient jdbc(Connection connection) {
        return JdbcClient.create(
                new SingleConnectionDataSource(
                        connection,
                        true
                )
        );
    }
}
