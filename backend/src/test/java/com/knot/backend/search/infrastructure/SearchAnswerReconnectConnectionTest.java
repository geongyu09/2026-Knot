package com.knot.backend.search.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.knot.backend.global.config.SearchWorkerProperties;
import com.knot.backend.search.application.SearchAnswerSnapshotService;
import com.knot.backend.search.application.dto.result.SearchAnswerSnapshotResult;
import com.knot.backend.search.application.dto.result.SearchEvidenceItemResult;
import com.knot.backend.search.domain.SearchMessageStatus;
import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

class SearchAnswerReconnectConnectionTest {
    private static final UUID TOKEN = UUID.randomUUID();

    private final SseEmitter emitter = mock(SseEmitter.class);
    private final SearchStreamReservation reservation = mock(SearchStreamReservation.class);
    private final SearchAnswerSnapshotService snapshots = mock(SearchAnswerSnapshotService.class);
    private final SearchWorkerProperties properties = new SearchWorkerProperties();
    private final List<String> events = new ArrayList<>();

    @BeforeEach
    void setUp() throws Exception {
        properties.setStreamPollInterval(Duration.ofMillis(1));
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

    @ParameterizedTest
    @EnumSource(value = SearchMessageStatus.class, names = {"COMPLETED", "FAILED", "STOPPED"})
    @DisplayName("종료 답변은 snapshot·근거·종료 순서로 복구하고 polling하지 않는다")
    void run_success_terminalSnapshot(SearchMessageStatus status) {
        connection(
                snapshot(
                        "한글 😀",
                        status,
                        TOKEN
                )
        ).run();
        assertThat(events).hasSize(3);
        assertThat(events.get(0)).contains(
                "event:snapshot",
                "answerId=50",
                "content=한글 😀"
        );
        assertThat(events.get(1)).contains(
                "event:evidence",
                "rank=1"
        );
        assertThat(events.get(2)).contains(
                "event:" + status.name()
                        .toLowerCase(),
                "status=" + status.name()
        );
        assertThat(
                String.join(
                        "",
                        events
                )
        ).doesNotContain(
                "answerMessageId",
                "event:accepted",
                "event:progress",
                "excluded_documents",
                "event:delta"
        );
        verify(
                snapshots,
                never()
        ).read(
                1,
                2,
                40,
                50
        );
        verify(emitter).complete();
        verify(reservation).close();
    }

    @Test
    @DisplayName("snapshot 전송 중 저장된 문자열과 이후 delta를 중복 없이 보낸다")
    void run_success_appendDuringSnapshot() throws Exception {
        CountDownLatch sending = new CountDownLatch(1);
        CountDownLatch resume = new CountDownLatch(1);
        doAnswer(call -> {
            SseEmitter.SseEventBuilder event = call.getArgument(0);
            String value = event.build()
                    .stream()
                    .map(data -> String.valueOf(data.getData()))
                    .collect(Collectors.joining());
            events.add(value);
            if (value.contains("event:snapshot")) {
                sending.countDown();
                assertThat(
                        resume.await(
                                5,
                                TimeUnit.SECONDS
                        )
                ).isTrue();
            }
            return null;
        }).when(emitter)
                .send(any(SseEmitter.SseEventBuilder.class));
        SearchAnswerSnapshotResult initial = snapshot(
                "A",
                SearchMessageStatus.STREAMING,
                TOKEN
        );
        try (java.util.concurrent.ExecutorService executor = Executors.newSingleThreadExecutor()) {
            java.util.concurrent.Future<?> running = executor.submit(connection(initial));
            try {
                assertThat(
                        sending.await(
                                5,
                                TimeUnit.SECONDS
                        )
                ).isTrue();
                when(
                        snapshots.read(
                                1,
                                2,
                                40,
                                50
                        )
                ).thenReturn(
                        snapshot(
                                "A😀B",
                                SearchMessageStatus.STREAMING,
                                TOKEN
                        ),
                        snapshot(
                                "A😀B",
                                SearchMessageStatus.STREAMING,
                                TOKEN
                        ),
                        snapshot(
                                "A😀BC",
                                SearchMessageStatus.COMPLETED,
                                TOKEN
                        )
                );
            } finally {
                resume.countDown();
            }
            running.get(
                    5,
                    TimeUnit.SECONDS
            );
        }
        assertThat(events).filteredOn(value -> value.contains("event:delta"))
                .hasSize(2);
        assertThat(
                String.join(
                        "",
                        events
                )
        ).contains(
                "text=😀B",
                "text=C"
        )
                .doesNotContain("text=A");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "XYZ", "ABCX"})
    @DisplayName("축소·대체된 본문 또는 다른 실행의 출력은 이어 붙이지 않는다")
    void run_failure_replacedContent(String content) {
        UUID changed = TOKEN;
        if (content.equals("ABCX")) {
            changed = UUID.randomUUID();
        }
        when(
                snapshots.read(
                        1,
                        2,
                        40,
                        50
                )
        ).thenReturn(
                snapshot(
                        content,
                        SearchMessageStatus.COMPLETED,
                        changed
                )
        );
        connection(
                snapshot(
                        "ABC",
                        SearchMessageStatus.STREAMING,
                        TOKEN
                )
        ).run();
        assertThat(events).hasSize(2);
        assertThat(
                String.join(
                        "",
                        events
                )
        ).doesNotContain(
                "event:delta",
                "event:completed"
        );
        verify(reservation).close();
    }

    @Test
    @DisplayName("claim 전 null token은 첫 claim으로 진행할 수 있다")
    void run_success_firstClaim() {
        when(
                snapshots.read(
                        1,
                        2,
                        40,
                        50
                )
        ).thenReturn(
                snapshot(
                        "답변",
                        SearchMessageStatus.COMPLETED,
                        TOKEN
                )
        );
        connection(
                snapshot(
                        "",
                        SearchMessageStatus.STREAMING,
                        null
                )
        ).run();
        assertThat(
                String.join(
                        "",
                        events
                )
        ).contains(
                "text=답변",
                "event:completed"
        );
    }

    @Test
    @DisplayName("고정된 token이 null로 바뀌면 새 시도를 섞지 않는다")
    void run_failure_resetExecution() {
        when(
                snapshots.read(
                        1,
                        2,
                        40,
                        50
                )
        ).thenReturn(
                snapshot(
                        "ABC",
                        SearchMessageStatus.STREAMING,
                        null
                )
        );
        connection(
                snapshot(
                        "ABC",
                        SearchMessageStatus.STREAMING,
                        TOKEN
                )
        ).run();
        assertThat(
                String.join(
                        "",
                        events
                )
        ).doesNotContain(
                "event:delta",
                "event:completed"
        );
    }

    @Test
    @DisplayName("저장 실패 code와 code 없는 기존 답변의 기본 오류를 복구한다")
    void run_success_failureCode() {
        SearchAnswerSnapshotResult initial = snapshot(
                "부분",
                SearchMessageStatus.FAILED,
                TOKEN
        );
        connection(initial).run();
        assertThat(events.getLast()).contains("code=ANSWER_TIMEOUT");
    }

    @Test
    @DisplayName("전송 IOException은 예약을 정리하고 컨테이너에 연결 종료를 맡긴다")
    void run_failure_disconnected() throws Exception {
        doThrow(new IOException("gone")).when(emitter)
                .send(any(SseEmitter.SseEventBuilder.class));
        connection(
                snapshot(
                        "부분",
                        SearchMessageStatus.COMPLETED,
                        TOKEN
                )
        ).run();
        verify(reservation).close();
        verify(
                emitter,
                never()
        ).completeWithError(any());
    }

    private SearchAnswerReconnectConnection connection(SearchAnswerSnapshotResult initial) {
        return new SearchAnswerReconnectConnection(
                emitter,
                reservation,
                snapshots,
                1,
                2,
                40,
                initial,
                properties
        );
    }

    @Test
    @DisplayName("한 구독의 전송이 대기해도 다른 구독은 종료 답변을 받는다")
    void run_success_slowSubscriberIsolation() throws Exception {
        CountDownLatch blocked = new CountDownLatch(1);
        CountDownLatch resume = new CountDownLatch(1);
        SseEmitter slow = mock(SseEmitter.class);
        doAnswer(call -> {
            blocked.countDown();
            assertThat(
                    resume.await(
                            5,
                            TimeUnit.SECONDS
                    )
            ).isTrue();
            return null;
        }).when(slow)
                .send(any(SseEmitter.SseEventBuilder.class));
        SearchAnswerSnapshotResult initial = snapshot(
                "답변",
                SearchMessageStatus.COMPLETED,
                TOKEN
        );
        SearchStreamReservation slowReservation = mock(SearchStreamReservation.class);
        when(slowReservation.isActive()).thenReturn(true);
        try (java.util.concurrent.ExecutorService executor = Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Future<?> waiting = executor.submit(
                    new SearchAnswerReconnectConnection(
                            slow,
                            slowReservation,
                            snapshots,
                            1,
                            2,
                            40,
                            initial,
                            properties
                    )
            );
            try {
                assertThat(
                        blocked.await(
                                5,
                                TimeUnit.SECONDS
                        )
                ).isTrue();
                executor.submit(connection(initial))
                        .get(
                                5,
                                TimeUnit.SECONDS
                        );
                assertThat(waiting.isDone()).isFalse();
                assertThat(events.getLast()).contains("event:completed");
            } finally {
                resume.countDown();
            }
            waiting.get(
                    5,
                    TimeUnit.SECONDS
            );
        }
    }

    @Test
    @DisplayName("실패 code가 없는 답변에는 기존 기본 오류를 사용하고 빈 근거를 만들지 않는다")
    void run_success_missingFailureCode() {
        connection(
                new SearchAnswerSnapshotResult(
                        50,
                        "",
                        SearchMessageStatus.FAILED,
                        null,
                        TOKEN,
                        null,
                        null,
                        List.of()
                )
        ).run();
        assertThat(events).hasSize(2);
        assertThat(events.getLast()).contains("code=ANSWER_GENERATION_FAILED");
    }

    private SearchAnswerSnapshotResult snapshot(
            String content,
            SearchMessageStatus status,
            UUID token
    ) {
        return new SearchAnswerSnapshotResult(
                50,
                content,
                status,
                "ANSWER_TIMEOUT",
                token,
                null,
                0,
                List.of(
                        new SearchEvidenceItemResult(
                                7,
                                "문서",
                                "주제",
                                1
                        )
                )
        );
    }
}
