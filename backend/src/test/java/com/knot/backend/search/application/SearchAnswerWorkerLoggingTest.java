package com.knot.backend.search.application;

import com.knot.backend.search.domain.SearchIntent;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;

import ch.qos.logback.classic.Level;
import com.knot.backend.global.config.SearchAgentProperties;
import com.knot.backend.search.application.dto.result.SearchAnswerWorkResult;
import com.knot.backend.testsupport.LogCapture;
import java.time.Clock;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CancellationException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

@org.junit.jupiter.api.extension.ExtendWith(org.mockito.junit.jupiter.MockitoExtension.class)
class SearchAnswerWorkerLoggingTest {
    private static final UUID TOKEN = UUID.fromString("00000000-0000-0000-0000-000000000099");

    private final SearchAnswerExecutionService executions = mock(SearchAnswerExecutionService.class);
    private final SearchDocumentRetriever retriever = mock(SearchDocumentRetriever.class);
    @org.mockito.Mock
    private ObjectProvider<SearchDocumentRetriever> retrievers;
    @org.mockito.Mock
    private ObjectProvider<SearchAnswerGenerator> generators;
    @org.mockito.Mock
    private ObjectProvider<SearchIntentClassifier> classifiers;

    @Test
    @DisplayName("탐색 생성과 실패 저장이 연달아 실패해도 최초 원인을 기록하고 저장 오류를 전파한다")
    void execute_failure_generationAndPersistence() {
        SearchAnswerWorker worker = worker();
        when(
                retriever.retrieve(
                        any(),
                        eq("private-question")
                )
        ).thenThrow(new IllegalStateException("private-provider"));
        IllegalStateException persistence = new IllegalStateException("private-sql");
        doThrow(persistence).when(executions)
                .fail(
                        5,
                        TOKEN,
                        "ANSWER_GENERATION_FAILED"
                );
        try (LogCapture logs = new LogCapture(SearchAnswerWorker.class)) {
            assertThatThrownBy(() -> worker.execute(5)).isSameAs(persistence);
            assertThat(
                    logs.events()
                            .stream()
                            .filter(event -> event.getLevel() != Level.INFO)
                            .toList()
            ).singleElement()
                    .satisfies(event -> {
                        assertThat(event.getLevel()).isEqualTo(Level.ERROR);
                        assertThat(event.getFormattedMessage()).contains(
                                "workspaceId=1",
                                "answerId=5",
                                "IllegalStateException"
                        )
                                .doesNotContain(
                                        "private-question",
                                        "private-provider",
                                        "private-sql",
                                        TOKEN.toString()
                                );
                    });
        }
    }

    @Test
    @DisplayName("정상 취소는 DEBUG로 기록하고 기존 종료 상태 처리를 유지한다")
    void execute_success_cancelDebug() {
        SearchAnswerWorker worker = worker();
        when(
                retriever.retrieve(
                        any(),
                        eq("private-question")
                )
        ).thenThrow(new CancellationException("private"));
        try (LogCapture logs = new LogCapture(SearchAnswerWorker.class)) {
            worker.execute(5);
            assertThat(
                    logs.events()
                            .stream()
                            .filter(event -> event.getLevel() != Level.INFO)
                            .toList()
            ).singleElement()
                    .satisfies(event -> assertThat(event.getLevel()).isEqualTo(Level.DEBUG));
        }
        verify(executions).fail(
                5,
                TOKEN,
                "ANSWER_GENERATION_FAILED"
        );
    }

    private SearchAnswerWorker worker() {
        when(executions.claim(5)).thenReturn(
                Optional.of(
                        new SearchAnswerWorkResult(
                                1,
                                2,
                                3,
                                4,
                                5,
                                TOKEN,
                                "private-question"
                        )
                )
        );
        when(retrievers.getObject()).thenReturn(retriever);
        SearchIntentClassifier classifier = mock(SearchIntentClassifier.class);
        when(classifiers.getObject()).thenReturn(classifier);
        when(
                classifier.classify(
                        any(),
                        any()
                )
        ).thenReturn(SearchIntent.MEETING_SEARCH);
        return new SearchAnswerWorker(
                executions,
                retrievers,
                generators,
                Clock.systemUTC(),
                new SearchAgentProperties(),
                classifiers
        );
    }
}
