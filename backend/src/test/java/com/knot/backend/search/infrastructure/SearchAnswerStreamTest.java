package com.knot.backend.search.infrastructure;

import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

import com.knot.backend.global.config.SearchWorkerProperties;
import com.knot.backend.search.application.SearchAnswerSnapshotService;
import com.knot.backend.search.domain.SearchException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

class SearchAnswerStreamTest {

    @Test
    @DisplayName("연결 용량을 접수 전에 예약하고 중복 해제는 허용하되 용량을 늘리지 않는다")
    void reserve_success_boundedAndIdempotentRelease() {
        SearchWorkerProperties properties = new SearchWorkerProperties();
        properties.setStreamConcurrency(1);
        SearchAnswerStream streams = new SearchAnswerStream(
                mock(SearchAnswerSnapshotService.class),
                mock(ThreadPoolTaskExecutor.class),
                properties
        );
        SearchStreamReservation first = streams.reserve();
        assertThatExceptionOfType(SearchException.class).isThrownBy(streams::reserve);
        first.close();
        first.close();
        SearchStreamReservation next = streams.reserve();
        assertThatExceptionOfType(SearchException.class).isThrownBy(streams::reserve);
        next.close();
        assertThatNoException().isThrownBy(
                () -> streams.reserve()
                        .close()
        );
    }

    @Test
    @DisplayName("전송 executor 용량도 접수 전에 확보하고 거절 시 예약을 해제한다")
    void reserve_failure_executorRejection() {
        ThreadPoolTaskExecutor executor = mock(ThreadPoolTaskExecutor.class);
        doThrow(new TaskRejectedException("full")).when(executor)
                .execute(any());
        SearchWorkerProperties properties = new SearchWorkerProperties();
        properties.setStreamConcurrency(1);
        SearchAnswerStream streams = new SearchAnswerStream(
                mock(SearchAnswerSnapshotService.class),
                executor,
                properties
        );
        assertThatExceptionOfType(SearchException.class).isThrownBy(streams::reserve);
        org.mockito.Mockito.reset(executor);
        assertThatNoException().isThrownBy(
                () -> streams.reserve()
                        .close()
        );
    }
}
