package com.knot.backend.global.logging;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RequestJdbcTimingTest {

    @Test
    @DisplayName("상세 표본은 64개로 제한하지만 전체 시간과 횟수는 계속 누적한다")
    void timing_success_boundsDetailsAndRetainsTotals() {
        // given
        RequestJdbcTiming timing = new RequestJdbcTiming(0);

        // when
        for (int index = 0; index < 100; index++) {
            timing.acquired(
                    "connection",
                    0,
                    1_000_000,
                    true
            );
            timing.executed(
                    "connection",
                    "hash",
                    2_000_000,
                    true
            );
            timing.returned(
                    "connection",
                    4_000_000,
                    true
            );
        }

        // then
        assertThat(timing.connections()).hasSize(64);
        assertThat(timing.queries()).hasSize(64);
        assertThat(timing.acquireCount()).isEqualTo(100);
        assertThat(timing.queryCount()).isEqualTo(100);
        assertThat(timing.acquireMs()).isEqualTo(100);
        assertThat(timing.usageMs()).isEqualTo(300);
        assertThat(timing.sqlMs()).isEqualTo(200);
        assertThat(timing.acquireMaxMs()).isEqualTo(1);
        assertThat(timing.usageMaxMs()).isEqualTo(3);
        assertThat(timing.sqlMaxMs()).isEqualTo(2);
    }

    @Test
    @DisplayName("반환 실패한 연결은 점유 완료로 기록하지 않는다")
    void timing_failure_connectionReturn() {
        // given
        RequestJdbcTiming timing = new RequestJdbcTiming(0);
        timing.acquired(
                "1",
                0,
                1_000_000,
                true
        );

        // when
        timing.returned(
                "1",
                3_000_000,
                false
        );

        // then
        assertThat(timing.openConnections()).isEqualTo(1);
        assertThat(timing.connections()).isEmpty();
        assertThat(timing.usageMs()).isZero();
    }

    @Test
    @DisplayName("요청 컨텍스트는 다른 스레드로 새지 않고 중첩 범위 종료 시 복원한다")
    void context_success_isolatesThreadsAndRestoresOuterScope() throws Exception {
        // given
        RequestJdbcTiming outer = new RequestJdbcTiming(0);
        RequestJdbcTiming inner = new RequestJdbcTiming(0);

        // when & then
        try (RequestJdbcTimingContext ignored = RequestJdbcTimingContext.open(outer);
                ExecutorService executor = Executors.newSingleThreadExecutor()) {
            assertThat(
                    executor.submit(RequestJdbcTimingContext::current)
                            .get()
            ).isNull();
            try (RequestJdbcTimingContext nested = RequestJdbcTimingContext.open(inner)) {
                assertThat(RequestJdbcTimingContext.current()).isSameAs(inner);
            }
            assertThat(RequestJdbcTimingContext.current()).isSameAs(outer);
        }
        assertThat(RequestJdbcTimingContext.current()).isNull();
    }
}
