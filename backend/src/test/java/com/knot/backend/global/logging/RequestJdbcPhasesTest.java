package com.knot.backend.global.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.sql.ResultSet;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RequestJdbcPhasesTest {

    @Test
    @DisplayName("조회 안의 마지막 결과셋 종료 후 처리 시간만 구분하고 이전 조회의 종료는 재사용하지 않는다")
    void phases_success_separatesQueryTailFromPreviousResults() {
        // given
        RequestJdbcPhases phases = new RequestJdbcTiming(0).phases();
        ResultSet first = mock(ResultSet.class);
        ResultSet second = mock(ResultSet.class);
        phases.queryExecuted(
                "1",
                1
        );
        phases.opened(
                first,
                "1",
                1_000_000
        );
        phases.queryExecuted(
                "1",
                2
        );
        phases.opened(
                second,
                "1",
                2_000_000
        );

        // when
        phases.resultCalled(
                second,
                "close",
                1_000_000,
                5_000_000,
                false,
                true
        );
        phases.resultCalled(
                first,
                "close",
                1_000_000,
                6_000_000,
                false,
                true
        );
        phases.operation(
                "query_list_findPage",
                null,
                0,
                9_000_000,
                true
        );
        phases.operation(
                "query_list_findTopics",
                null,
                10_000_000,
                12_000_000,
                true
        );

        // then
        assertThat(phases.resultSets(12_000_000)).extracting(JdbcResultSetTiming::sqlSequence)
                .containsExactly(
                        2,
                        1
                );
        assertThat(
                phases.operations()
                        .getFirst()
                        .afterLastResultCloseMs()
        ).isEqualTo(3.0);
        assertThat(
                phases.operations()
                        .getLast()
                        .afterLastResultCloseMs()
        ).isNull();
    }

    @Test
    @DisplayName("상세 표본은 64개로 제한해도 전체 합계와 실패 횟수는 유지한다")
    void phases_success_boundsSamplesWithoutTruncatingTotals() {
        // given
        RequestJdbcPhases phases = new RequestJdbcTiming(0).phases();

        // when
        for (int index = 1; index <= 80; index++) {
            ResultSet resultSet = mock(ResultSet.class);
            phases.queryExecuted(
                    "1",
                    index
            );
            phases.opened(
                    resultSet,
                    "1",
                    0
            );
            phases.resultCalled(
                    resultSet,
                    "close",
                    1_000_000,
                    2_000_000,
                    false,
                    true
            );
            phases.operation(
                    "jdbc_commit",
                    "1",
                    0,
                    3_000_000,
                    false
            );
        }

        // then
        assertThat(phases.resultSets(0)).hasSize(64);
        assertThat(phases.operations()).hasSize(64);
        assertThat(phases.resultSetCount()).isEqualTo(80);
        assertThat(phases.resultSetMs()).isEqualTo(160);
        assertThat(phases.resultSetJdbcMs()).isEqualTo(80);
        assertThat(phases.operationCount()).isEqualTo(80);
        assertThat(phases.operationCounts()).containsEntry(
                "jdbc_commit",
                80
        );
        assertThat(phases.operationMs()).containsEntry(
                "jdbc_commit",
                240.0
        );
        assertThat(phases.failures()).isEqualTo(80);
    }
}
