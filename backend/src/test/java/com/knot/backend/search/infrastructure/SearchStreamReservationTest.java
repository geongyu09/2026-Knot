package com.knot.backend.search.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
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
        assertThatThrownBy(() -> reservation.attach(mock(Runnable.class))).isInstanceOf(IllegalStateException.class);
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
}
