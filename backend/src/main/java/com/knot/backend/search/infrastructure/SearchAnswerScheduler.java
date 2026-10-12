package com.knot.backend.search.infrastructure;

import com.knot.backend.global.config.SearchWorkerProperties;
import com.knot.backend.search.application.SearchAnswerExecutionService;
import com.knot.backend.search.application.SearchAnswerWorker;
import com.knot.backend.search.domain.SearchRepository;
import java.time.Clock;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;

@Component
@EnableScheduling
@Slf4j
@ConditionalOnProperty(prefix = "knot.search.worker", name = "enabled", havingValue = "true")
public class SearchAnswerScheduler {

    private final SearchRepository repository;
    private final SearchAnswerWorker worker;
    private final SearchAnswerExecutionService executions;
    private final SearchWorkerProperties properties;
    private final ThreadPoolTaskExecutor executor;
    private final Clock clock;

    public SearchAnswerScheduler(
            SearchRepository repository,
            SearchAnswerWorker worker,
            SearchAnswerExecutionService executions,
            SearchWorkerProperties properties,
            @Qualifier("searchGenerationExecutor") ThreadPoolTaskExecutor executor,
            Clock clock
    ) {
        this.repository = repository;
        this.worker = worker;
        this.executions = executions;
        this.properties = properties;
        this.executor = executor;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${knot.search.worker.poll-interval:1s}")
    public void dispatchQueued() {
        for (long answerId : repository.findQueuedAnswerIds(properties.getCandidateLimit())) {
            try {
                executor.execute(() -> execute(answerId));
            } catch (TaskRejectedException exception) {
                return;
            }
        }
    }

    @Scheduled(fixedDelayString = "${knot.search.worker.recovery-interval:5s}")
    public void recoverExpired() {
        for (long answerId : repository.findExpiredAnswerIds(
                clock.instant(),
                properties.getCandidateLimit()
        )) {
            try {
                executions.expire(answerId);
            } catch (RuntimeException exception) {
                log.warn(
                        "Search answer recovery deferred: answerId={}",
                        answerId
                );
            }
        }
    }

    private void execute(long answerId) {
        try {
            worker.execute(answerId);
        } catch (RuntimeException exception) {
            log.warn(
                    "Search answer execution deferred: answerId={}",
                    answerId
            );
        }
    }
}
