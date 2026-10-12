package com.knot.backend.search.presentation.stream;

import com.knot.backend.global.config.SearchWorkerProperties;
import com.knot.backend.search.application.SearchAnswerSnapshotService;
import com.knot.backend.search.application.dto.result.SearchQuestionAcceptedResult;
import com.knot.backend.search.application.dto.result.SearchAnswerSnapshotResult;
import com.knot.backend.search.domain.SearchErrorCode;
import com.knot.backend.search.domain.SearchException;
import java.io.IOException;
import java.util.concurrent.Semaphore;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

public class SearchAnswerStream {

    private final SearchAnswerSnapshotService snapshots;
    private final ThreadPoolTaskExecutor executor;
    private final SearchWorkerProperties properties;
    private final Semaphore capacity;

    public SearchAnswerStream(
            SearchAnswerSnapshotService snapshots,
            ThreadPoolTaskExecutor executor,
            SearchWorkerProperties properties
    ) {
        this.snapshots = snapshots;
        this.executor = executor;
        this.properties = properties;
        this.capacity = new Semaphore(properties.getStreamConcurrency());
    }

    public SearchStreamReservation reserve() {
        if (!capacity.tryAcquire()) {
            throw new SearchException(SearchErrorCode.ANSWER_GENERATION_UNAVAILABLE);
        }
        SearchStreamReservation reservation = new SearchStreamReservation(capacity);
        try {
            executor.execute(reservation);
            return reservation;
        } catch (RuntimeException exception) {
            reservation.reject();
            throw new SearchException(SearchErrorCode.ANSWER_GENERATION_UNAVAILABLE);
        }
    }

    public SseEmitter open(
            long workspaceId,
            long memberId,
            SearchQuestionAcceptedResult accepted,
            SearchStreamReservation reservation
    ) {
        SseEmitter emitter = createEmitter(reservation);
        try {
            emitter.send(
                    SseEmitter.event()
                            .name("accepted")
                            .data(accepted)
            );
            reservation.attach(
                    new SearchAnswerSseConnection(
                            emitter,
                            reservation,
                            snapshots,
                            workspaceId,
                            memberId,
                            accepted.answerMessageId(),
                            properties.getStreamPollInterval()
                    )
            );
            return emitter;
        } catch (IOException | RuntimeException exception) {
            reservation.close();
            emitter.completeWithError(exception);
            throw new SearchException(SearchErrorCode.ANSWER_GENERATION_UNAVAILABLE);
        }
    }

    public SseEmitter reconnect(
            long workspaceId,
            long memberId,
            long conversationId,
            long answerId
    ) {
        SearchAnswerSnapshotResult initial = snapshots.read(
                workspaceId,
                memberId,
                conversationId,
                answerId
        );
        SearchStreamReservation reservation = reserve();
        try {
            SseEmitter emitter = createEmitter(reservation);
            reservation.attach(
                    new SearchAnswerReconnectConnection(
                            emitter,
                            reservation,
                            snapshots,
                            workspaceId,
                            memberId,
                            conversationId,
                            initial,
                            properties
                    )
            );
            return emitter;
        } catch (RuntimeException exception) {
            reservation.close();
            throw exception;
        }
    }

    private SseEmitter createEmitter(SearchStreamReservation reservation) {
        SseEmitter emitter = new SseEmitter(
                properties.getStreamTimeout()
                        .toMillis()
        );
        emitter.onCompletion(reservation::close);
        emitter.onTimeout(reservation::close);
        emitter.onError(error -> reservation.close());
        return emitter;
    }
}
