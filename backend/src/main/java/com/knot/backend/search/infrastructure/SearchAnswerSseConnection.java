package com.knot.backend.search.infrastructure;

import com.knot.backend.search.application.SearchAnswerSnapshotService;
import com.knot.backend.search.application.dto.result.SearchAnswerSnapshotResult;
import com.knot.backend.search.domain.SearchMessageStatus;
import com.knot.backend.search.domain.SearchProgressStage;
import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

final class SearchAnswerSseConnection implements Runnable {

    private final SseEmitter emitter;
    private final SearchStreamReservation reservation;
    private final SearchAnswerSnapshotService snapshots;
    private final long workspaceId;
    private final long memberId;
    private final long answerId;
    private final Duration interval;
    private int sentLength;
    private SearchProgressStage sentStage;
    private boolean sentExcludedCount;
    private UUID executionToken;

    SearchAnswerSseConnection(
            SseEmitter emitter,
            SearchStreamReservation reservation,
            SearchAnswerSnapshotService snapshots,
            long workspaceId,
            long memberId,
            long answerId,
            Duration interval
    ) {
        this.emitter = emitter;
        this.reservation = reservation;
        this.snapshots = snapshots;
        this.workspaceId = workspaceId;
        this.memberId = memberId;
        this.answerId = answerId;
        this.interval = interval;
    }

    @Override
    public void run() {
        try {
            poll();
            emitter.complete();
        } catch (InterruptedException exception) {
            Thread.currentThread()
                    .interrupt();
            emitter.complete();
        } catch (IOException | RuntimeException exception) {
            emitter.completeWithError(exception);
        } finally {
            reservation.close();
        }
    }

    private void poll() throws IOException, InterruptedException {
        while (reservation.isActive()) {
            SearchAnswerSnapshotResult snapshot = snapshots.read(
                    workspaceId,
                    memberId,
                    answerId
            );
            if (changedExecution(snapshot.executionToken())) {
                return;
            }
            sendProgress(snapshot);
            sendExcludedCount(snapshot.excludedCount());
            sendContent(snapshot.content());
            if (snapshot.status() != SearchMessageStatus.STREAMING) {
                sendTerminal(snapshot);
                return;
            }
            Thread.sleep(interval);
        }
    }

    private boolean changedExecution(UUID token) {
        if (token == null) {
            return false;
        }
        if (executionToken == null) {
            executionToken = token;
            return false;
        }
        return !executionToken.equals(token);
    }

    private void sendProgress(SearchAnswerSnapshotResult snapshot) throws IOException {
        SearchProgressStage stage = snapshot.stage();
        if (stage == null) {
            stage = SearchProgressStage.SEARCHING;
        }
        if (stage == sentStage) {
            return;
        }
        send(
                "progress",
                Map.of(
                        "stage",
                        stage.name()
                )
        );
        sentStage = stage;
    }

    private void sendExcludedCount(Integer count) throws IOException {
        if (count == null || sentExcludedCount) {
            return;
        }
        send(
                "excluded_documents",
                Map.of(
                        "count",
                        count
                )
        );
        sentExcludedCount = true;
    }

    private void sendContent(String content) throws IOException {
        if (content.length() < sentLength) {
            throw new IllegalStateException("answer content was replaced");
        }
        if (content.length() == sentLength) {
            return;
        }
        send(
                "delta",
                Map.of(
                        "answerMessageId",
                        answerId,
                        "text",
                        content.substring(sentLength)
                )
        );
        sentLength = content.length();
    }

    private void sendTerminal(SearchAnswerSnapshotResult snapshot) throws IOException {
        send(
                "evidence",
                Map.of(
                        "answerMessageId",
                        answerId,
                        "items",
                        snapshot.evidences()
                )
        );
        if (snapshot.status() == SearchMessageStatus.FAILED) {
            send(
                    "failed",
                    Map.of(
                            "answerMessageId",
                            answerId,
                            "status",
                            "FAILED",
                            "code",
                            failureCode(snapshot)
                    )
            );
            return;
        }
        if (snapshot.status() == SearchMessageStatus.STOPPED) {
            send(
                    "stopped",
                    Map.of(
                            "answerMessageId",
                            answerId,
                            "status",
                            "STOPPED"
                    )
            );
            return;
        }
        send(
                "completed",
                Map.of(
                        "answerMessageId",
                        answerId,
                        "status",
                        "COMPLETED"
                )
        );
    }

    private String failureCode(SearchAnswerSnapshotResult snapshot) {
        if (snapshot.failureCode() == null) {
            return "ANSWER_GENERATION_FAILED";
        }
        return snapshot.failureCode();
    }

    private void send(
            String event,
            Object data
    ) throws IOException {
        emitter.send(
                SseEmitter.event()
                        .name(event)
                        .data(
                                data,
                                MediaType.APPLICATION_JSON
                        )
        );
    }
}
