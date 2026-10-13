package com.knot.backend.search.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import ch.qos.logback.classic.Level;
import com.knot.backend.testsupport.LogCapture;
import java.util.concurrent.RejectedExecutionException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;

import com.knot.backend.search.application.SearchToolAccess;
import com.knot.backend.search.application.SearchToolScope;
import java.io.InputStream;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CancellationException;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

@Timeout(5)
class SearchTransportCancellationTest {

    @Test
    @DisplayName("감시 해제는 future를 취소하며 늦게 연결한 본문도 닫는다")
    void close_success_lateBodyAndIdempotence() throws Exception {
        try (SearchTransportCancellation cancellation = new SearchTransportCancellation(
                mock(SearchToolAccess.class),
                Duration.ofMillis(10)
        )) {
            CompletableFuture<HttpResponse<InputStream>> pending = new CompletableFuture<>();
            SearchTransportRegistration registration = cancellation.watch(
                    scope(),
                    pending
            );
            registration.close();
            registration.close();
            InputStream body = mock(InputStream.class);
            registration.attach(body);
            verify(body).close();
            assertThat(pending).isCancelled();
            assertThat(cancellation.activeCount()).isZero();
        }
    }

    @Test
    @DisplayName("정상 본문 등록 뒤 해제하면 stream과 감시 task를 한 번만 정리한다")
    void close_success_attachedBody() throws Exception {
        try (SearchTransportCancellation cancellation = new SearchTransportCancellation(
                mock(SearchToolAccess.class),
                Duration.ofMillis(10)
        )) {
            CompletableFuture<HttpResponse<InputStream>> pending = new CompletableFuture<>();
            SearchTransportRegistration registration = cancellation.watch(
                    scope(),
                    pending
            );
            InputStream body = mock(InputStream.class);
            registration.attach(body);
            registration.close();
            registration.close();
            verify(
                    body,
                    times(1)
            ).close();
            assertThat(cancellation.activeCount()).isZero();
        }
    }

    @Test
    @DisplayName("DB 유효성 확인 실패는 진행 중 HTTP future를 취소한다")
    void watch_failure_accessCheck() {
        SearchToolAccess access = mock(SearchToolAccess.class);
        SearchToolScope scope = scope();
        doThrow(new IllegalStateException("DB unavailable")).when(access)
                .validate(scope);
        try (SearchTransportCancellation cancellation = new SearchTransportCancellation(
                access,
                Duration.ofMillis(10)
        )) {
            CompletableFuture<HttpResponse<InputStream>> pending = new CompletableFuture<>();
            cancellation.watch(
                    scope,
                    pending
            );
            assertThatThrownBy(
                    () -> pending.get(
                            2,
                            TimeUnit.SECONDS
                    )
            ).isInstanceOf(CancellationException.class);
        }
    }

    @Test
    @DisplayName("감시 종료 시 진행 중 교환을 정리하고 새 등록을 거절한다")
    void close_success_shutdownCleanup() {
        SearchTransportCancellation cancellation = new SearchTransportCancellation(
                mock(SearchToolAccess.class),
                Duration.ofMillis(10)
        );
        CompletableFuture<HttpResponse<InputStream>> pending = new CompletableFuture<>();
        cancellation.watch(
                scope(),
                pending
        );
        cancellation.close();
        assertThat(pending).isCancelled();
        assertThat(cancellation.activeCount()).isZero();
        CompletableFuture<HttpResponse<InputStream>> late = new CompletableFuture<>();
        assertThatThrownBy(
                () -> cancellation.watch(
                        scope(),
                        late
                )
        ).isInstanceOf(RejectedExecutionException.class);
        assertThat(late).isCancelled();
        assertThat(cancellation.activeCount()).isZero();
    }

    @Test
    @DisplayName("취소 감시 주기는 1ms 이상이어야 한다")
    void create_failure_invalidInterval() {
        assertThatThrownBy(
                () -> new SearchTransportCancellation(
                        mock(SearchToolAccess.class),
                        Duration.ZERO
                )
        ).isInstanceOf(com.knot.backend.search.domain.SearchException.class);
        assertThatThrownBy(
                () -> new SearchTransportCancellation(
                        mock(SearchToolAccess.class),
                        Duration.ofNanos(1)
                )
        ).isInstanceOf(com.knot.backend.search.domain.SearchException.class);
    }

    private SearchToolScope scope() {
        Instant now = Instant.now();
        return new SearchToolScope(
                1,
                1,
                1,
                1,
                2,
                UUID.randomUUID(),
                now,
                now.plusSeconds(10)
        );
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    @DisplayName("실제 감시 task의 DB 실패는 취소와 함께 한 번 기록하고 접근 철회는 ERROR 없이 종료한다")
    void watch_failure_recordsInternalOnce(boolean internal) throws Exception {
        SearchToolAccess access = mock(SearchToolAccess.class);
        doThrow(monitorFailure(internal)).when(access)
                .validate(org.mockito.ArgumentMatchers.any(SearchToolScope.class));
        try (LogCapture logs = new LogCapture(SearchTransportCancellation.class);
                SearchTransportCancellation cancellation = new SearchTransportCancellation(
                        access,
                        Duration.ofMillis(10)
                )) {
            CompletableFuture<HttpResponse<InputStream>> pending = new CompletableFuture<>();
            cancellation.watch(
                    scope(),
                    pending
            );
            assertThatThrownBy(
                    () -> pending.get(
                            2,
                            TimeUnit.SECONDS
                    )
            ).isInstanceOf(CancellationException.class);
            assertThat(logs.events()).singleElement()
                    .satisfies(event -> {
                        assertThat(event.getLevel()).isEqualTo(monitorLevel(internal));
                        assertThat(event.getFormattedMessage()).contains("phase=access-monitor")
                                .doesNotContain("private-sql");
                    });
        }
    }

    private RuntimeException monitorFailure(boolean internal) {
        if (internal) {
            return new IllegalStateException("private-sql");
        }
        return new com.knot.backend.search.domain.SearchToolException("SEARCH_ACCESS_DENIED");
    }

    private Level monitorLevel(boolean internal) {
        if (internal) {
            return Level.ERROR;
        }
        return Level.DEBUG;
    }

}
