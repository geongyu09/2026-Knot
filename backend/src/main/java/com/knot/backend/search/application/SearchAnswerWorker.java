package com.knot.backend.search.application;

import com.knot.backend.global.logging.ServerErrorLogger;
import com.knot.backend.search.application.dto.result.SearchAnswerWorkResult;
import com.knot.backend.search.application.dto.result.SearchDocumentResult;
import com.knot.backend.search.application.dto.result.SearchRetrievalResult;
import com.knot.backend.search.domain.SearchIntent;
import java.time.Clock;
import java.time.Instant;
import com.knot.backend.global.config.SearchAgentProperties;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CancellationException;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component
@RequiredArgsConstructor
@Slf4j
public class SearchAnswerWorker {
    private static final String NO_DOCUMENT_GUIDANCE = "현재 검색 가능한 회의 문서에서는 해당 내용을 확인하지 못했습니다. 내용을 녹음하고 문서 준비가 끝난 뒤 다시 질문해 주세요.";

    private final SearchAnswerExecutionService executions;
    private final ObjectProvider<SearchDocumentRetriever> retrievers;
    private final ObjectProvider<SearchAnswerGenerator> generators;
    private final Clock clock;
    private final SearchAgentProperties agentProperties;
    private final ObjectProvider<SearchIntentClassifier> classifiers;

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public void execute(long answerId) {
        Optional<SearchAnswerWorkResult> claimed = executions.claim(answerId);
        if (claimed.isEmpty()) {
            return;
        }
        SearchAnswerWorkResult work = claimed.orElseThrow();
        try {
            generate(work);
        } catch (RuntimeException exception) {
            ServerErrorLogger.recordTaskFailure(
                    log,
                    "Search generation failed workspaceId=" + work.workspaceId() + " answerId=" + answerId
                            + " conversationId=" + work.conversationId() + " phase=generation",
                    exception
            );
            executions.fail(
                    answerId,
                    work.token(),
                    "ANSWER_GENERATION_FAILED"
            );
        }
    }

    private void generate(SearchAnswerWorkResult work) {
        Instant startedAt = clock.instant();
        SearchToolScope scope = SearchToolScope.from(
                work,
                startedAt,
                startedAt.plus(agentProperties.getBudget())
        );
        long classificationStarted = System.nanoTime();
        SearchIntent intent = classifiers.getObject()
                .classify(
                        scope,
                        work.question()
                );
        log.info(
                "Search intent classified workspaceId={} answerId={} intent={} elapsedMs={}",
                work.workspaceId(),
                work.answerId(),
                intent,
                (System.nanoTime() - classificationStarted) / 1_000_000
        );
        if (!intent.requiresSearch()) {
            completeGuidance(
                    work,
                    intent
            );
            return;
        }
        SearchDocumentRetriever retriever = retrievers.getObject();
        SearchRetrievalResult retrieval = retriever.retrieve(
                scope,
                work.question()
        );
        if (!executions.recordRetrieval(
                work.answerId(),
                work.token(),
                retrieval.excludedCount(),
                retrieval.documents()
        )) {
            return;
        }
        List<SearchDocumentResult> documents = retrieval.documents();
        if (documents.isEmpty()) {
            append(
                    work,
                    NO_DOCUMENT_GUIDANCE
            );
            executions.complete(
                    work.answerId(),
                    work.token(),
                    List.of(),
                    Set.of()
            );
            return;
        }
        SearchAnswerGenerator generator = generators.getObject();
        List<Long> usedIds;
        try (SearchAnswerContentBuffer content = new SearchAnswerContentBuffer(
                text -> append(
                        work,
                        text
                )
        )) {
            usedIds = generator.generate(
                    scope,
                    work.question(),
                    documents,
                    content
            );
        }
        Set<Long> candidates = documents.stream()
                .map(SearchDocumentResult::documentId)
                .collect(Collectors.toSet());
        executions.complete(
                work.answerId(),
                work.token(),
                usedIds,
                candidates
        );
    }

    private void completeGuidance(
            SearchAnswerWorkResult work,
            SearchIntent intent
    ) {
        if (!executions.recordRetrieval(
                work.answerId(),
                work.token(),
                0,
                List.of()
        )) {
            return;
        }
        append(
                work,
                SearchIntentGuidance.forIntent(intent)
        );
        executions.complete(
                work.answerId(),
                work.token(),
                List.of(),
                Set.of()
        );
    }

    private void append(
            SearchAnswerWorkResult work,
            String text
    ) {
        if (!executions.append(
                work.answerId(),
                work.token(),
                text
        )) {
            throw new CancellationException("answer execution ended");
        }
    }
}
