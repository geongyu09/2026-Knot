package com.knot.backend.search.presentation.stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;

import ch.qos.logback.classic.Level;
import com.knot.backend.auth.domain.AuthenticatedMember;
import com.knot.backend.global.config.SearchWorkerProperties;
import com.knot.backend.global.config.SearchWorkerConfig;
import com.knot.backend.global.logging.RequestIdFilter;
import org.slf4j.MDC;
import com.knot.backend.global.exception.GlobalExceptionHandler;
import com.knot.backend.global.exception.SearchQuestionExceptionHandler;
import com.knot.backend.search.application.SearchAnswerSnapshotService;
import com.knot.backend.search.application.SearchQuestionIntakeService;
import com.knot.backend.search.application.SearchAnswerRetryService;
import com.knot.backend.search.application.dto.result.SearchQuestionAcceptedResult;
import com.knot.backend.search.application.dto.result.SearchAnswerSnapshotResult;
import com.knot.backend.search.domain.SearchMessageStatus;
import com.knot.backend.search.presentation.SearchQuestionController;
import com.knot.backend.search.presentation.SearchAnswerEventsController;
import com.knot.backend.testsupport.LogCapture;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class SearchSseLoggingMvcTest {
    private static final String TRANSPORT_ID = "0123456789abcdef0123456789abcdef";

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    @DisplayName("실제 SSE 작업의 초기·재연결 오류는 async dispatch에서 한 번 기록하고 이미 쓴 본문을 유지한다")
    void stream_failure_realAsyncDispatch(boolean reconnect) throws Exception {
        SearchAnswerSnapshotService snapshots = mock(SearchAnswerSnapshotService.class);
        CountDownLatch initialized = new CountDownLatch(1);
        CountDownLatch connectionMayStart = new CountDownLatch(1);
        CountDownLatch snapshotSent = new CountDownLatch(1);
        IllegalStateException failure = new IllegalStateException("private-sql");
        if (reconnect) {
            when(
                    snapshots.read(
                            1,
                            2,
                            3,
                            5
                    )
            ).thenReturn(
                    new SearchAnswerSnapshotResult(
                            5,
                            "restored",
                            SearchMessageStatus.STREAMING,
                            null,
                            null,
                            null,
                            null,
                            List.of(),
                            0
                    )
            )
                    .thenAnswer(call -> {
                        assertThat(MDC.get("requestId")).isEqualTo(TRANSPORT_ID);
                        snapshotSent.countDown();
                        assertThat(
                                initialized.await(
                                        5,
                                        TimeUnit.SECONDS
                                )
                        ).isTrue();
                        throw failure;
                    });
        }
        if (!reconnect) {
            doAnswer(call -> {
                assertThat(MDC.get("requestId")).isEqualTo(TRANSPORT_ID);
                assertThat(
                        initialized.await(
                                5,
                                TimeUnit.SECONDS
                        )
                ).isTrue();
                throw failure;
            }).when(snapshots)
                    .read(
                            1,
                            2,
                            5
                    );
        }
        ThreadPoolTaskExecutor executor = new SearchWorkerConfig().searchStreamExecutor(new SearchWorkerProperties());
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(1);
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(5);
        executor.initialize();
        executor.execute(() -> awaitSignal(connectionMayStart));
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new UsernamePasswordAuthenticationToken(
                                AuthenticatedMember.of(
                                        2,
                                        "test-member",
                                        null
                                ),
                                null,
                                List.of()
                        )
                );
        try (LogCapture logs = new LogCapture(
                GlobalExceptionHandler.class,
                SearchQuestionExceptionHandler.class,
                SearchStreamReservation.class
        )) {
            SearchAnswerStream streams = new SearchAnswerStream(
                    snapshots,
                    executor,
                    new SearchWorkerProperties()
            );
            SearchQuestionIntakeService intake = mock(SearchQuestionIntakeService.class);
            when(
                    intake.acceptFirst(
                            eq(1L),
                            eq(2L),
                            any()
                    )
            ).thenReturn(
                    new SearchQuestionAcceptedResult(
                            3,
                            4,
                            5
                    )
            );
            MockMvc mvc = MockMvcBuilders.standaloneSetup(
                    new SearchQuestionController(
                            intake,
                            mock(SearchAnswerRetryService.class),
                            streams
                    ),
                    new SearchAnswerEventsController(streams)
            )
                    .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                    .addFilters(new RequestIdFilter())
                    .setControllerAdvice(
                            new GlobalExceptionHandler(),
                            new SearchQuestionExceptionHandler(new GlobalExceptionHandler())
                    )
                    .build();
            MvcResult started = start(
                    mvc,
                    reconnect
            );
            assertThat(
                    started.getRequest()
                            .isAsyncStarted()
            ).isTrue();
            assertThat(
                    started.getResponse()
                            .getHeader("X-Request-ID")
            ).isEqualTo(TRANSPORT_ID);
            assertThat(MDC.get("requestId")).isNull();
            connectionMayStart.countDown();
            awaitInitialSnapshot(
                    snapshotSent,
                    reconnect
            );
            assertThat(
                    started.getResponse()
                            .isCommitted()
            ).isTrue();
            String priorBody = started.getResponse()
                    .getContentAsString();
            assertThat(priorBody).contains(firstEvent(reconnect));
            initialized.countDown();
            assertThat(started.getAsyncResult(5000)).isSameAs(failure);
            MvcResult completed = mvc.perform(asyncDispatch(started))
                    .andReturn();
            assertThat(
                    completed.getResponse()
                            .getHeader("X-Request-ID")
            ).isEqualTo(TRANSPORT_ID);
            assertThat(MDC.get("requestId")).isNull();
            assertThat(
                    completed.getResponse()
                            .getStatus()
            ).isEqualTo(200);
            assertThat(
                    completed.getResponse()
                            .getContentAsString()
            ).isEqualTo(priorBody)
                    .doesNotContain("private-sql");
            assertThat(logs.events()).singleElement()
                    .satisfies(event -> {
                        assertThat(event.getLevel()).isEqualTo(Level.ERROR);
                        assertThat(event.getLoggerName()).isEqualTo(SearchQuestionExceptionHandler.class.getName());
                        assertThat(event.getFormattedMessage()).contains("IllegalStateException")
                                .doesNotContain("private-sql");
                        assertThat(event.getThrowableProxy()).isNull();
                        assertThat(event.getMDCPropertyMap()).containsEntry(
                                "requestId",
                                TRANSPORT_ID
                        );
                    });
        } finally {
            connectionMayStart.countDown();
            initialized.countDown();
            executor.shutdown();
            SecurityContextHolder.clearContext();
        }
    }

    private void awaitInitialSnapshot(
            CountDownLatch snapshotSent,
            boolean reconnect
    ) {
        if (!reconnect) {
            return;
        }
        awaitSignal(snapshotSent);
    }

    private String firstEvent(boolean reconnect) {
        if (reconnect) {
            return "event:snapshot";
        }
        return "event:accepted";
    }

    private void awaitSignal(CountDownLatch signal) {
        try {
            assertThat(
                    signal.await(
                            5,
                            TimeUnit.SECONDS
                    )
            ).isTrue();
        } catch (InterruptedException exception) {
            Thread.currentThread()
                    .interrupt();
            throw new AssertionError(exception);
        }
    }

    private MvcResult start(
            MockMvc mvc,
            boolean reconnect
    ) throws Exception {
        if (reconnect) {
            return mvc
                    .perform(
                            get("/api/v1/workspaces/1/search/conversations/3/answers/5/events").header(
                                    "X-Request-ID",
                                    TRANSPORT_ID
                            )
                                    .accept("text/event-stream")
                    )
                    .andReturn();
        }
        return mvc.perform(
                post("/api/v1/workspaces/1/search/conversations").contentType("application/json")
                        .header(
                                "X-Request-ID",
                                TRANSPORT_ID
                        )
                        .accept("text/event-stream")
                        .content(
                                "{\"content\":\"private-question\",\"requestId\":\"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\"}"
                        )
        )
                .andReturn();
    }
}
