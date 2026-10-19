package com.knot.backend.search.presentation.stream;

import static org.assertj.core.api.Assertions.assertThat;
import ch.qos.logback.classic.Level;
import com.knot.backend.testsupport.LogCapture;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.util.concurrent.Semaphore;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SearchStreamReservationTest {

    @Test
    @DisplayName("Runnable 연결 작업을 실행한 뒤 전송 슬롯을 한 번만 반환한다")
    void run_success_releaseOnce() {
        Semaphore capacity = new Semaphore(0);
        SearchStreamReservation reservation = new SearchStreamReservation(capacity);
        Runnable connection = mock(Runnable.class);
        reservation.attach(connection);
        reservation.run();
        reservation.close();
        verify(connection).run();
        assertThat(capacity.availablePermits()).isEqualTo(1);
        assertThat(reservation.isActive()).isFalse();
    }

    @Test
    @DisplayName("닫힌 예약에는 다시 작업을 붙일 수 없다")
    void attach_failure_ended() {
        SearchStreamReservation reservation = new SearchStreamReservation(new Semaphore(0));
        reservation.close();
        assertThatThrownBy(() -> reservation.attach(mock(Runnable.class)))
                .isInstanceOf(com.knot.backend.search.domain.SearchException.class);
    }

    @Test
    @DisplayName("연결 전에 취소한 예약의 대기 작업도 종료한다")
    void run_success_cancelBeforeAttach() {
        Semaphore capacity = new Semaphore(0);
        SearchStreamReservation reservation = new SearchStreamReservation(capacity);
        reservation.close();
        reservation.run();
        assertThat(capacity.availablePermits()).isEqualTo(1);
    }

    @Test
    @DisplayName("예약 실행 자체의 오류는 원본을 기록하고 슬롯을 한 번만 반환한다")
    void run_failure_readyAndReleaseOnce() {
        Semaphore capacity = new Semaphore(0);
        SearchStreamReservation reservation = new SearchStreamReservation(capacity);
        IllegalStateException failure = new IllegalStateException("private-token");
        reservation.attach(() -> {
            throw failure;
        });
        try (LogCapture logs = new LogCapture(SearchStreamReservation.class)) {
            assertThatThrownBy(reservation::run).isSameAs(failure);
            reservation.close();
            assertThat(logs.events()).singleElement()
                    .satisfies(event -> {
                        assertThat(event.getLevel()).isEqualTo(Level.ERROR);
                        assertThat(event.getFormattedMessage()).contains("IllegalStateException")
                                .doesNotContain("private-token");
                    });
        }
        assertThat(capacity.availablePermits()).isEqualTo(1);
    }

    @Test
    @DisplayName("예약 future의 실패는 원인 예외를 보존하고 실행 경계에서 한 번 기록한다")
    void run_failure_exceptionalFuture() {
        Semaphore capacity = new Semaphore(0);
        SearchStreamReservation reservation = new SearchStreamReservation(capacity);
        Object future = org.springframework.test.util.ReflectionTestUtils.getField(
                reservation,
                "connection"
        );
        java.util.concurrent.CompletableFuture.class.cast(future)
                .completeExceptionally(new IllegalStateException("private-future"));
        try (LogCapture logs = new LogCapture(SearchStreamReservation.class)) {
            assertThatThrownBy(reservation::run).isInstanceOf(com.knot.backend.search.domain.SearchException.class)
                    .hasCauseInstanceOf(java.util.concurrent.ExecutionException.class)
                    .hasRootCauseInstanceOf(IllegalStateException.class);
            assertThat(logs.events()).singleElement()
                    .satisfies(
                            event -> assertThat(event.getFormattedMessage()).contains(
                                    "ExecutionException",
                                    "IllegalStateException"
                            )
                                    .doesNotContain("private-future")
                    );
        }
        assertThat(capacity.availablePermits()).isEqualTo(1);
    }

}
