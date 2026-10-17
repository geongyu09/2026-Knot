package com.knot.backend.search.presentation.stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Level;
import com.knot.backend.global.config.SearchWorkerProperties;
import com.knot.backend.search.application.SearchAnswerSnapshotService;
import com.knot.backend.search.application.dto.result.SearchAnswerSnapshotResult;
import com.knot.backend.search.domain.model.SearchMessageStatus;
import com.knot.backend.testsupport.LogCapture;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

class SearchAnswerRetryConnectionTest {

    private final SseEmitter emitter = mock(SseEmitter.class);
    private final SearchStreamReservation reservation = mock(SearchStreamReservation.class);
    private final SearchAnswerSnapshotService snapshots = mock(SearchAnswerSnapshotService.class);
    private final List<String> events = new ArrayList<>();

    @Test
    @DisplayName("첫 SSE delta 기록은 저장 시각과 전송 결과를 남기고 답변 본문을 남기지 않는다")
    void run_success_logsFirstDeltaWithoutContent() {
        when(
                snapshots.read(
                        1,
                        2,
                        50
                )
        ).thenReturn(
                snapshot(
                        1,
                        "",
                        SearchMessageStatus.STREAMING,
                        null
                ),
                new SearchAnswerSnapshotResult(
                        50,
                        "private-answer",
                        SearchMessageStatus.COMPLETED,
                        null,
                        UUID.randomUUID(),
                        null,
                        0,
                        List.of(),
                        1,
                        Instant.now()
                                .minusSeconds(1)
                )
        );
        try (LogCapture logs = new LogCapture(SearchAnswerSseConnection.class)) {
            new SearchAnswerSseConnection(
                    emitter,
                    reservation,
                    snapshots,
                    1,
                    2,
                    50,
                    Duration.ofMillis(1),
                    1
            ).run();
            assertThat(logs.events()).singleElement()
                    .satisfies(event -> {
                        assertThat(event.getLevel()).isEqualTo(Level.INFO);
                        assertThat(event.getFormattedMessage()).contains(
                                "phase=sse_first_delta",
                                "answerId=50",
                                "contentPersistedAtToSseSendMs=",
                                "outcome=success"
                        )
                                .doesNotContain("private-answer");
                    });
        }
        assertThat(
                String.join(
                        "",
                        events
                )
        ).contains("private-answer")
                .doesNotContain("contentUpdatedAt");
    }

    @BeforeEach
    void setUp() throws Exception {
        when(reservation.isActive()).thenReturn(true);
        doAnswer(call -> {
            SseEmitter.SseEventBuilder event = call.getArgument(0);
            events.add(
                    event.build()
                            .stream()
                            .map(data -> String.valueOf(data.getData()))
                            .collect(Collectors.joining())
            );
            return null;
        }).when(emitter)
                .send(any(SseEmitter.SseEventBuilder.class));
    }

    @Test
    @DisplayName("첫 polling 전에 재시도된 답변을 이전 접수 연결에 전송하지 않는다")
    void run_success_rejectChangedReceiptBeforeClaim() {
        // given
        when(
                snapshots.read(
                        1,
                        2,
                        50
                )
        ).thenReturn(
                snapshot(
                        2,
                        "새 답변",
                        SearchMessageStatus.COMPLETED,
                        null
                )
        );
        // when
        new SearchAnswerSseConnection(
                emitter,
                reservation,
                snapshots,
                1,
                2,
                50,
                Duration.ofMillis(1),
                1
        ).run();
        // then
        assertThat(events).isEmpty();
        verify(emitter).complete();
        verify(reservation).close();
    }

    @Test
    @DisplayName("같은 접수의 QUEUED에서 RUNNING 전이는 정상 답변을 전송한다")
    void run_success_claimSameReceipt() {
        // given
        when(
                snapshots.read(
                        1,
                        2,
                        50
                )
        ).thenReturn(
                snapshot(
                        1,
                        "",
                        SearchMessageStatus.STREAMING,
                        null
                ),
                snapshot(
                        1,
                        "재시도 답변",
                        SearchMessageStatus.COMPLETED,
                        UUID.randomUUID()
                )
        );
        // when
        new SearchAnswerSseConnection(
                emitter,
                reservation,
                snapshots,
                1,
                2,
                50,
                Duration.ofMillis(1),
                1
        ).run();
        // then
        assertThat(
                String.join(
                        "",
                        events
                )
        ).contains(
                "text=재시도 답변",
                "event:completed"
        );
        verify(reservation).close();
    }

    @Test
    @DisplayName("재연결 snapshot 이후 실행 token 없는 새 재시도의 출력도 섞지 않는다")
    void run_success_reconnectRejectsChangedReceipt() {
        // given
        SearchWorkerProperties properties = new SearchWorkerProperties();
        properties.setStreamPollInterval(Duration.ofMillis(1));
        when(
                snapshots.read(
                        1,
                        2,
                        40,
                        50
                )
        ).thenReturn(
                snapshot(
                        2,
                        "새 시도의 긴 답변",
                        SearchMessageStatus.COMPLETED,
                        null
                )
        );
        // when
        new SearchAnswerReconnectConnection(
                emitter,
                reservation,
                snapshots,
                1,
                2,
                40,
                snapshot(
                        1,
                        "",
                        SearchMessageStatus.STREAMING,
                        null
                ),
                properties
        ).run();
        // then
        assertThat(events).hasSize(1);
        assertThat(events.getFirst()).contains("event:snapshot")
                .doesNotContain("새 시도");
        verify(emitter).complete();
        verify(reservation).close();
    }

    private SearchAnswerSnapshotResult snapshot(
            long receipt,
            String content,
            SearchMessageStatus status,
            UUID token
    ) {
        return new SearchAnswerSnapshotResult(
                50,
                content,
                status,
                null,
                token,
                null,
                null,
                List.of(),
                receipt
        );
    }
}
