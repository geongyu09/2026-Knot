package com.knot.backend.search.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;

import com.knot.backend.global.config.SearchWorkerConfig;
import com.knot.backend.global.config.SearchWorkerProperties;
import com.knot.backend.search.application.SearchAnswerSnapshotService;
import com.knot.backend.search.domain.SearchException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

class SearchAnswerStreamTest {

    @Test
    @DisplayName("연결 종료 콜백 뒤에도 전송 작업이 끝나기 전까지 용량을 반환하지 않는다")
    void reserve_failure_workerStillOccupied() {
        ThreadPoolTaskExecutor executor = mock(ThreadPoolTaskExecutor.class);
        SearchAnswerStream streams = streams(executor);
        SearchStreamReservation first = streams.reserve();
        first.close();
        assertThatExceptionOfType(SearchException.class).isThrownBy(streams::reserve);
    }

    @Test
    @DisplayName("종료된 전송 작업이 반환한 용량으로 다음 연결을 예약한다")
    void reserve_success_afterWorkerExit() {
        ThreadPoolTaskExecutor executor = mock(ThreadPoolTaskExecutor.class);
        SearchAnswerStream streams = streams(executor);
        SearchStreamReservation first = streams.reserve();
        ArgumentCaptor<Runnable> task = ArgumentCaptor.forClass(Runnable.class);
        verify(executor).execute(task.capture());
        first.close();
        task.getValue().run();
        assertThatNoException().isThrownBy(() -> streams.reserve().close());
    }

    @Test
    @DisplayName("중복 종료 콜백과 작업 종료는 permit 하나만 반환한다")
    void close_success_idempotentPermit() {
        Semaphore capacity = new Semaphore(0);
        SearchStreamReservation reservation = new SearchStreamReservation(capacity);
        reservation.close();
        reservation.close();
        reservation.run();
        assertThat(capacity.availablePermits()).isEqualTo(1);
    }

    @Test
    @DisplayName("executor 거절 시 사용하지 못한 예약 용량을 반환한다")
    void reserve_failure_executorRejection() {
        ThreadPoolTaskExecutor executor = mock(ThreadPoolTaskExecutor.class);
        doThrow(new TaskRejectedException("full")).when(executor).execute(any());
        SearchAnswerStream streams = streams(executor);
        assertThatExceptionOfType(SearchException.class).isThrownBy(streams::reserve);
    }

    @Test
    @DisplayName("executor 거절 후 다음 예약은 정상적으로 허용된다")
    void reserve_success_afterExecutorRejection() {
        ThreadPoolTaskExecutor executor = mock(ThreadPoolTaskExecutor.class);
        doThrow(new TaskRejectedException("full")).when(executor).execute(any());
        SearchAnswerStream streams = streams(executor);
        try {
            streams.reserve();
        } catch (SearchException ignored) {
        }
        reset(executor);
        assertThatNoException().isThrownBy(() -> streams.reserve().close());
    }

    @Test
    @DisplayName("Runnable 종료와 실제 스레드 반환 사이에도 다음 예약을 안전하게 받는다")
    void reserve_success_workerRetirementGap() throws Exception {
        SearchWorkerProperties properties = properties();
        ThreadPoolTaskExecutor executor = new SearchWorkerConfig().searchStreamExecutor(properties);
        CountDownLatch retiring = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        executor.setTaskDecorator(task -> () -> {
            task.run();
            retiring.countDown();
            try {
                release.await();
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
        });
        executor.initialize();
        try {
            SearchAnswerStream streams = new SearchAnswerStream(mock(SearchAnswerSnapshotService.class), executor, properties);
            streams.reserve().close();
            assertThat(retiring.await(2, TimeUnit.SECONDS)).isTrue();
            assertThatNoException().isThrownBy(() -> streams.reserve().close());
        } finally {
            release.countDown();
            executor.shutdown();
        }
    }

    private SearchAnswerStream streams(ThreadPoolTaskExecutor executor) {
        return new SearchAnswerStream(mock(SearchAnswerSnapshotService.class), executor, properties());
    }

    private SearchWorkerProperties properties() {
        SearchWorkerProperties properties = new SearchWorkerProperties();
        properties.setStreamConcurrency(1);
        return properties;
    }
}
