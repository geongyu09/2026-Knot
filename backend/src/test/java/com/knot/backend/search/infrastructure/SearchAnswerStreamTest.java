package com.knot.backend.search.infrastructure;

import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;

import com.knot.backend.search.domain.SearchErrorCode;
import com.knot.backend.search.domain.SearchMessageStatus;
import com.knot.backend.search.application.dto.result.SearchAnswerSnapshotResult;
import java.util.List;
import org.mockito.ArgumentCaptor;

import com.knot.backend.global.config.SearchWorkerProperties;
import com.knot.backend.search.application.SearchAnswerSnapshotService;
import com.knot.backend.search.domain.SearchException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

class SearchAnswerStreamTest {

    @Test
    @DisplayName("snapshot 검증 실패는 전송 슬롯을 예약하기 전에 반환한다")
    void reconnect_failure_invalidSnapshot() {
        SearchAnswerSnapshotService snapshots = mock(SearchAnswerSnapshotService.class);
        ThreadPoolTaskExecutor executor = mock(ThreadPoolTaskExecutor.class);
        when(
                snapshots.read(
                        1,
                        2,
                        40,
                        50
                )
        ).thenThrow(new SearchException(SearchErrorCode.ANSWER_NOT_FOUND));
        SearchAnswerStream streams = new SearchAnswerStream(
                snapshots,
                executor,
                new SearchWorkerProperties()
        );
        assertThatExceptionOfType(SearchException.class).isThrownBy(
                () -> streams.reconnect(
                        1,
                        2,
                        40,
                        50
                )
        );
        verify(
                executor,
                never()
        ).execute(any());
    }

    @Test
    @DisplayName("재연결 전송 작업을 예약 실행하고 완료 뒤 용량을 반환한다")
    void reconnect_success_releaseAfterTerminal() {
        SearchAnswerSnapshotService snapshots = mock(SearchAnswerSnapshotService.class);
        ThreadPoolTaskExecutor executor = mock(ThreadPoolTaskExecutor.class);
        when(
                snapshots.read(
                        1,
                        2,
                        40,
                        50
                )
        ).thenReturn(
                new SearchAnswerSnapshotResult(
                        50,
                        "답변",
                        SearchMessageStatus.COMPLETED,
                        null,
                        null,
                        null,
                        null,
                        List.of()
                )
        );
        SearchWorkerProperties properties = new SearchWorkerProperties();
        properties.setStreamConcurrency(1);
        SearchAnswerStream streams = new SearchAnswerStream(
                snapshots,
                executor,
                properties
        );
        streams.reconnect(
                1,
                2,
                40,
                50
        );
        ArgumentCaptor<Runnable> task = ArgumentCaptor.forClass(Runnable.class);
        verify(executor).execute(task.capture());
        task.getValue()
                .run();
        assertThatNoException().isThrownBy(
                () -> streams.reserve()
                        .close()
        );
    }

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
