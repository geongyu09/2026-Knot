package com.knot.backend.search.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.doAnswer;

import com.knot.backend.document.DocumentFixtures;
import com.knot.backend.search.SearchMessageFixtures;
import com.knot.backend.search.application.dto.command.SearchQuestionCommand;
import com.knot.backend.search.application.dto.result.SearchAnswerSnapshotResult;
import com.knot.backend.search.application.dto.result.SearchAnswerWorkResult;
import com.knot.backend.search.application.dto.result.SearchDocumentResult;
import com.knot.backend.search.application.dto.result.SearchQuestionAcceptedResult;
import com.knot.backend.search.application.dto.result.SearchRetrievalResult;
import com.knot.backend.testsupport.TestApplicationProperties;
import com.knot.backend.testsupport.TestcontainersConfiguration;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
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
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Tag("integration")
@ActiveProfiles("dev")
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@TestApplicationProperties
class SearchAnswerExecutionIntegrationTest {
    private static final Instant NOW = Instant.parse("2026-10-11T00:00:00Z");

    @Autowired
    private SearchQuestionIntakeService intake;
    @Autowired
    private SearchAnswerExecutionService service;
    @Autowired
    private SearchAnswerWorker worker;
    @Autowired
    private SearchAnswerSnapshotService snapshots;
    @Autowired
    private com.knot.backend.search.domain.SearchRepository repository;
    @Autowired
    private JdbcClient jdbc;
    @MockitoBean
    private SearchGenerationAvailability availability;
    @MockitoBean
    private SearchDocumentRetriever retriever;
    @MockitoBean
    private SearchAnswerGenerator generator;
    @MockitoBean
    private Clock clock;
    private DocumentFixtures fixtures;
    private SearchMessageFixtures messages;
    private long workspaceId;
    private long memberId;
    private SearchQuestionAcceptedResult accepted;

    @BeforeEach
    void setUp() {
        when(clock.instant()).thenReturn(NOW);
        jdbc.sql("TRUNCATE TABLE members, workspaces RESTART IDENTITY CASCADE")
                .update();
        fixtures = new DocumentFixtures(jdbc);
        messages = new SearchMessageFixtures(jdbc);
        memberId = fixtures.saveMember("질문자");
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
    }

    @Test
    @DisplayName("두 worker가 같은 작업을 선점하면 한 실행만 얻는다")
    void claim_success_concurrent() throws Exception {
        CyclicBarrier start = new CyclicBarrier(2);
        try (java.util.concurrent.ExecutorService executor = Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Future<Boolean> first = executor.submit(() -> {
                start.await();
                return service.claim(accepted.answerMessageId())
                        .isPresent();
            });
            java.util.concurrent.Future<Boolean> second = executor.submit(() -> {
                start.await();
                return service.claim(accepted.answerMessageId())
                        .isPresent();
            });
            assertThat(
                    List.of(
                            first.get(),
                            second.get()
                    )
            ).containsExactlyInAnyOrder(
                    true,
                    false
            );
        }
    }

    @Test
    @DisplayName("부분 본문 저장은 현재 token만 허용하고 실패는 본문을 보존하며 최초 대화를 숨긴다")
    void fail_success_partialAndHidden() {
        SearchAnswerWorkResult work = service.claim(accepted.answerMessageId())
                .orElseThrow();
        assertThat(
                service.append(
                        work.answerId(),
                        UUID.randomUUID(),
                        "오래된 실행"
                )
        ).isFalse();
        assertThat(
                service.append(
                        work.answerId(),
                        work.token(),
                        "한글 😀"
                )
        ).isTrue();
        assertThat(
                service.fail(
                        work.answerId(),
                        work.token(),
                        "ANSWER_GENERATION_FAILED"
                )
        ).isTrue();
        assertThat(
                service.append(
                        work.answerId(),
                        work.token(),
                        "늦은 본문"
                )
        ).isFalse();
        assertThat(content()).isEqualTo("한글 😀");
        assertThat(status()).isEqualTo("FAILED");
        assertThat(visible()).isFalse();
    }

    @Test
    @DisplayName("완료 본문과 실제 사용 근거를 함께 저장하고 근거 순위를 유지한다")
    void complete_success_usedEvidenceOnly() {
        SearchAnswerWorkResult work = service.claim(accepted.answerMessageId())
                .orElseThrow();
        long first = messages.saveDocument(
                workspaceId,
                memberId
        );
        long second = messages.saveDocument(
                workspaceId,
                memberId
        );
        long candidate = messages.saveDocument(
                workspaceId,
                memberId
        );
        service.append(
                work.answerId(),
                work.token(),
                "답변"
        );
        assertThat(
                service.complete(
                        work.answerId(),
                        work.token(),
                        List.of(
                                second,
                                first
                        ),
                        Set.of(
                                first,
                                second,
                                candidate
                        )
                )
        ).isTrue();
        assertThat(status()).isEqualTo("COMPLETED");
        assertThat(
                jdbc.sql("SELECT document_id FROM search_evidences ORDER BY rank")
                        .query(Long.class)
                        .list()
        ).containsExactly(
                second,
                first
        );
        assertThat(
                service.fail(
                        work.answerId(),
                        work.token(),
                        "ANSWER_GENERATION_FAILED"
                )
        ).isFalse();
        assertThat(content()).isEqualTo("답변");
    }

    @Test
    @DisplayName("검색 후보에 없는 문서와 중복 또는 네 개 근거는 완료 저장 전에 거절한다")
    void complete_failure_invalidEvidence() {
        SearchAnswerWorkResult work = service.claim(accepted.answerMessageId())
                .orElseThrow();
        long document = messages.saveDocument(
                workspaceId,
                memberId
        );
        assertThatThrownBy(
                () -> service.complete(
                        work.answerId(),
                        work.token(),
                        List.of(document),
                        Set.of()
                )
        ).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(
                () -> service.complete(
                        work.answerId(),
                        work.token(),
                        List.of(
                                document,
                                document
                        ),
                        Set.of(document)
                )
        ).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(
                () -> service.complete(
                        work.answerId(),
                        work.token(),
                        List.of(
                                1L,
                                2L,
                                3L,
                                4L
                        ),
                        Set.of(
                                1L,
                                2L,
                                3L,
                                4L
                        )
                )
        ).isInstanceOf(IllegalArgumentException.class);
        assertThat(status()).isEqualTo("STREAMING");
        assertThat(evidenceCount()).isZero();
    }

    @Test
    @DisplayName("다른 Workspace 문서를 사용하면 본문 종료와 근거가 함께 롤백한다")
    void complete_failure_otherWorkspaceEvidence() {
        SearchAnswerWorkResult work = service.claim(accepted.answerMessageId())
                .orElseThrow();
        long valid = messages.saveDocument(
                workspaceId,
                memberId
        );
        long otherWorkspace = fixtures.saveWorkspace();
        fixtures.join(
                otherWorkspace,
                memberId
        );
        long invalid = messages.saveDocument(
                otherWorkspace,
                memberId
        );
        assertThatThrownBy(
                () -> service.complete(
                        work.answerId(),
                        work.token(),
                        List.of(
                                valid,
                                invalid
                        ),
                        Set.of(
                                valid,
                                invalid
                        )
                )
        ).isInstanceOf(IllegalArgumentException.class);
        assertThat(status()).isEqualTo("STREAMING");
        assertThat(evidenceCount()).isZero();
    }

    @Test
    @DisplayName("기한에 도달하면 부분 답변은 FAILED로 복구하고 자동 재생성하지 않는다")
    void expire_success_preservesPartialAndFencesLateResults() {
        SearchAnswerWorkResult work = service.claim(accepted.answerMessageId())
                .orElseThrow();
        service.append(
                work.answerId(),
                work.token(),
                "부분"
        );
        when(clock.instant()).thenReturn(NOW.plusSeconds(150));
        assertThat(
                service.append(
                        work.answerId(),
                        work.token(),
                        "늦음"
                )
        ).isFalse();
        assertThat(service.expire(work.answerId())).isTrue();
        assertThat(service.expire(work.answerId())).isFalse();
        assertThat(
                service.complete(
                        work.answerId(),
                        work.token(),
                        List.of(),
                        Set.of()
                )
        ).isFalse();
        assertThat(service.claim(work.answerId())).isEmpty();
        assertThat(status()).isEqualTo("FAILED");
        assertThat(content()).isEqualTo("부분");
        assertThat(
                jdbc.sql("SELECT failure_code FROM search_messages WHERE id = :id")
                        .param(
                                "id",
                                work.answerId()
                        )
                        .query(String.class)
                        .single()
        ).isEqualTo("ANSWER_GENERATION_TIMEOUT");
        assertThat(visible()).isFalse();
    }

    @Test
    @DisplayName("기한 전 실행과 미실행 대기 작업을 실패 복구로 종료시키지 않는다")
    void expire_success_preservesActiveAndQueued() {
        assertThat(service.expire(accepted.answerMessageId())).isFalse();
        service.claim(accepted.answerMessageId())
                .orElseThrow();
        assertThat(service.expire(accepted.answerMessageId())).isFalse();
        assertThat(status()).isEqualTo("STREAMING");
    }

    @Test
    @DisplayName("근거가 없으면 LLM 없이 녹음 안내를 정상 완료한다")
    void execute_success_noDocuments() {
        when(
                retriever.retrieve(
                        workspaceId,
                        "질문"
                )
        ).thenAnswer(call -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return new SearchRetrievalResult(
                    List.of(),
                    2
            );
        });
        worker.execute(accepted.answerMessageId());
        assertThat(status()).isEqualTo("COMPLETED");
        assertThat(content()).contains("녹음");
        assertThat(evidenceCount()).isZero();
        assertThat(
                jdbc.sql("SELECT excluded_count FROM search_answer_executions")
                        .query(Integer.class)
                        .single()
        ).isEqualTo(2);
        verifyNoInteractions(generator);
    }

    @Test
    @DisplayName("생성은 TX 밖에서 진행하며 delta와 실제 사용 문서만 저장한다")
    void execute_success_generatorOutsideTransaction() {
        long document = messages.saveDocument(
                workspaceId,
                memberId
        );
        List<SearchDocumentResult> candidates = List.of(
                new SearchDocumentResult(
                        document,
                        "문서",
                        "주제",
                        "본문"
                )
        );
        when(
                retriever.retrieve(
                        workspaceId,
                        "질문"
                )
        ).thenReturn(
                new SearchRetrievalResult(
                        candidates,
                        1
                )
        );
        doAnswer(call -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            Consumer<String> delta = call.getArgument(2);
            delta.accept("한글 ");
            delta.accept("😀");
            return List.of(document);
        }).when(generator)
                .generate(
                        org.mockito.ArgumentMatchers.eq("질문"),
                        org.mockito.ArgumentMatchers.eq(candidates),
                        org.mockito.ArgumentMatchers.any()
                );
        worker.execute(accepted.answerMessageId());
        assertThat(status()).isEqualTo("COMPLETED");
        assertThat(content()).isEqualTo("한글 😀");
        assertThat(evidenceCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("검색 실패를 근거 없음으로 오인하지 않고 안전한 FAILED로 종료한다")
    void execute_failure_retrievalError() {
        when(
                retriever.retrieve(
                        workspaceId,
                        "질문"
                )
        ).thenThrow(new IllegalStateException("비공개 공급자 오류"));
        worker.execute(accepted.answerMessageId());
        assertThat(status()).isEqualTo("FAILED");
        assertThat(content()).isEmpty();
        assertThat(visible()).isFalse();
        verifyNoInteractions(generator);
    }

    @Test
    @DisplayName("동시 완료·실패는 먼저 확정된 종료만 남기고 이후 상태를 덮어쓰지 않는다")
    void complete_success_terminalRace() throws Exception {
        SearchAnswerWorkResult work = service.claim(accepted.answerMessageId())
                .orElseThrow();
        service.append(
                work.answerId(),
                work.token(),
                "부분 답변"
        );
        CyclicBarrier start = new CyclicBarrier(2);
        try (java.util.concurrent.ExecutorService executor = Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Future<Boolean> completed = executor.submit(() -> {
                start.await();
                return service.complete(
                        work.answerId(),
                        work.token(),
                        List.of(),
                        Set.of()
                );
            });
            java.util.concurrent.Future<Boolean> failed = executor.submit(() -> {
                start.await();
                return service.fail(
                        work.answerId(),
                        work.token(),
                        "ANSWER_GENERATION_FAILED"
                );
            });
            assertThat(
                    List.of(
                            completed.get(),
                            failed.get()
                    )
            ).containsExactlyInAnyOrder(
                    true,
                    false
            );
            assertThat(status().equals("COMPLETED")).isEqualTo(completed.get());
        }
        assertThat(content()).isEqualTo("부분 답변");
    }

    @Test
    @DisplayName("생성 중 오류가 발생하면 이미 저장한 본문은 남기고 근거를 만들지 않는다")
    void execute_failure_preservesGeneratedPartial() {
        long document = messages.saveDocument(
                workspaceId,
                memberId
        );
        List<SearchDocumentResult> candidates = List.of(
                new SearchDocumentResult(
                        document,
                        "문서",
                        "주제",
                        "본문"
                )
        );
        when(
                retriever.retrieve(
                        workspaceId,
                        "질문"
                )
        ).thenReturn(
                new SearchRetrievalResult(
                        candidates,
                        0
                )
        );
        doAnswer(call -> {
            Consumer<String> delta = call.getArgument(2);
            delta.accept("이미 생성한 부분 😀");
            throw new IllegalStateException("공급자 연결 오류");
        }).when(generator)
                .generate(
                        org.mockito.ArgumentMatchers.eq("질문"),
                        org.mockito.ArgumentMatchers.eq(candidates),
                        org.mockito.ArgumentMatchers.any()
                );
        worker.execute(accepted.answerMessageId());
        assertThat(status()).isEqualTo("FAILED");
        assertThat(content()).isEqualTo("이미 생성한 부분 😀");
        assertThat(evidenceCount()).isZero();
    }

    private String content() {
        return jdbc.sql("SELECT content FROM search_messages WHERE id = :id")
                .param(
                        "id",
                        accepted.answerMessageId()
                )
                .query(String.class)
                .single();
    }

    private String status() {
        return jdbc.sql("SELECT status FROM search_messages WHERE id = :id")
                .param(
                        "id",
                        accepted.answerMessageId()
                )
                .query(String.class)
                .single();
    }

    private boolean visible() {
        return jdbc.sql("SELECT visible_in_list FROM search_conversations WHERE id = :id")
                .param(
                        "id",
                        accepted.conversationId()
                )
                .query(Boolean.class)
                .single();
    }

    private long evidenceCount() {
        return jdbc.sql("SELECT COUNT(*) FROM search_evidences")
                .query(Long.class)
                .single();
    }

    @Test
    @DisplayName("재시작 때 남아 있는 대기 작업은 DB 후보 조회에서 다시 실행할 수 있다")
    void execute_success_durableQueuedWork() {
        assertThat(repository.findQueuedAnswerIds(20)).containsExactly(accepted.answerMessageId());
        when(
                retriever.retrieve(
                        workspaceId,
                        "질문"
                )
        ).thenReturn(
                new SearchRetrievalResult(
                        List.of(),
                        0
                )
        );
        org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor executor = org.mockito.Mockito
                .mock(org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor.class);
        doAnswer(call -> {
            Runnable task = call.getArgument(0);
            task.run();
            return null;
        }).when(executor)
                .execute(org.mockito.ArgumentMatchers.any());
        com.knot.backend.search.infrastructure.SearchAnswerScheduler restarted = new com.knot.backend.search.infrastructure.SearchAnswerScheduler(
                repository,
                worker,
                service,
                new com.knot.backend.global.config.SearchWorkerProperties(),
                executor,
                clock
        );
        restarted.dispatchQueued();
        assertThat(status()).isEqualTo("COMPLETED");
        assertThat(repository.findQueuedAnswerIds(20)).isEmpty();
    }

    @Test
    @DisplayName("snapshot은 소유자 범위와 현재 멤버십을 확인하고 생성 상태를 변경하지 않는다")
    void read_success_currentSnapshotAndAccess() {
        SearchAnswerWorkResult work = service.claim(accepted.answerMessageId())
                .orElseThrow();
        service.append(
                work.answerId(),
                work.token(),
                "부분 😀"
        );
        SearchAnswerSnapshotResult snapshot = snapshots.read(
                workspaceId,
                memberId,
                work.answerId()
        );
        assertThat(snapshot.content()).isEqualTo("부분 😀");
        assertThat(snapshot.status()).isEqualTo(com.knot.backend.search.domain.SearchMessageStatus.STREAMING);
        assertThat(snapshot.evidences()).isEmpty();
        assertThat(status()).isEqualTo("STREAMING");
        long otherMember = fixtures.saveMember("다른 사용자");
        fixtures.join(
                workspaceId,
                otherMember
        );
        assertThatThrownBy(
                () -> snapshots.read(
                        workspaceId,
                        otherMember,
                        work.answerId()
                )
        ).isInstanceOf(com.knot.backend.search.domain.SearchException.class);
        jdbc.sql("UPDATE workspace_members SET left_at = CURRENT_TIMESTAMP WHERE member_id = :id")
                .param(
                        "id",
                        memberId
                )
                .update();
        assertThatThrownBy(
                () -> snapshots.read(
                        workspaceId,
                        memberId,
                        work.answerId()
                )
        ).isInstanceOf(com.knot.backend.search.domain.SearchException.class);
    }

    @Test
    @DisplayName("실행 전 멤버십이 회수되면 문서를 읽지 않고 실패 종료한다")
    void claim_failure_revokedMembership() {
        jdbc.sql("UPDATE workspace_members SET left_at = CURRENT_TIMESTAMP")
                .update();
        worker.execute(accepted.answerMessageId());
        assertThat(status()).isEqualTo("FAILED");
        assertThat(visible()).isFalse();
        verifyNoInteractions(
                retriever,
                generator
        );
    }

    @Test
    @DisplayName("실행 중 멤버십이 회수되면 이후 delta를 저장하지 않고 실패 종료한다")
    void append_failure_revokedMembership() {
        SearchAnswerWorkResult work = service.claim(accepted.answerMessageId())
                .orElseThrow();
        service.append(
                work.answerId(),
                work.token(),
                "기존 본문"
        );
        jdbc.sql("UPDATE workspace_members SET left_at = CURRENT_TIMESTAMP")
                .update();
        assertThat(
                service.append(
                        work.answerId(),
                        work.token(),
                        "추가 본문"
                )
        ).isFalse();
        assertThat(status()).isEqualTo("FAILED");
        assertThat(content()).isEqualTo("기존 본문");
    }
}
