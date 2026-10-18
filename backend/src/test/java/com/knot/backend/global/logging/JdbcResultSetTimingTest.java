package com.knot.backend.global.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.concurrent.atomic.AtomicLong;
import javax.sql.DataSource;
import net.ttddyy.dsproxy.support.ProxyDataSourceBuilder;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class JdbcResultSetTimingTest {

    @Test
    @DisplayName("SQL 실행 이후 결과 순회와 매핑 구간을 커밋 반환과 구분한다")
    void listener_success_separatesResultConsumptionAndCompletion() throws Exception {
        // given
        AtomicLong clock = new AtomicLong();
        DataSource target = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement statement = mock(PreparedStatement.class);
        ResultSet result = mock(ResultSet.class);
        when(target.getConnection()).thenReturn(connection);
        when(connection.prepareStatement("select secret_value")).thenReturn(statement);
        when(statement.executeQuery()).thenAnswer(call -> {
            clock.addAndGet(10_000_000);
            return result;
        });
        when(result.next()).thenAnswer(call -> {
            clock.addAndGet(2_000_000);
            return true;
        });
        when(result.getString(1)).thenAnswer(call -> {
            clock.addAndGet(3_000_000);
            return "secret_value";
        });
        doAnswer(call -> {
            clock.addAndGet(1_000_000);
            return null;
        }).when(result)
                .close();
        doAnswer(call -> {
            clock.addAndGet(7_000_000);
            return null;
        }).when(connection)
                .commit();
        doAnswer(call -> {
            clock.addAndGet(4_000_000);
            return null;
        }).when(connection)
                .close();
        DataSource proxy = ProxyDataSourceBuilder.create(target)
                .proxyResultSet()
                .listener(new JdbcTimingListener(clock::get))
                .build();
        RequestJdbcTiming timing = new RequestJdbcTiming(0);

        // when
        try (RequestJdbcTimingContext ignored = RequestJdbcTimingContext.open(timing)) {
            Connection borrowed = proxy.getConnection();
            ResultSet rows = borrowed.prepareStatement("select secret_value")
                    .executeQuery();
            rows.next();
            rows.getString(1);
            clock.addAndGet(20_000_000);
            rows.close();
            rows.close();
            borrowed.commit();
            borrowed.close();
        }

        // then
        assertThat(timing.sqlMs()).isEqualTo(10);
        RequestJdbcPhases phases = timing.phases();
        assertThat(phases.resultSetCount()).isEqualTo(1);
        assertThat(phases.resultSetMs()).isEqualTo(26);
        assertThat(phases.resultSetJdbcMs()).isEqualTo(6);
        assertThat(phases.openResultSets()).isZero();
        assertThat(phases.operationMs()).containsEntry(
                "jdbc_commit",
                7.0
        )
                .containsEntry(
                        "jdbc_close",
                        4.0
                );
        JdbcResultSetTiming sample = phases.resultSets(clock.get())
                .getFirst();
        assertThat(sample.sqlSequence()).isEqualTo(1);
        assertThat(sample.startedOffsetMs()).isEqualTo(10);
        assertThat(sample.rows()).isEqualTo(1);
        assertThat(sample.closed()).isTrue();
        assertThat(
                phases.resultSets(clock.get())
                        .toString()
        ).doesNotContain("secret_value");
    }

    @Test
    @DisplayName("결과 읽기와 close가 실패해도 원래 예외와 미닫힌 상태를 보존한다")
    void listener_failure_preservesReadAndCloseFailures() throws Exception {
        // given
        AtomicLong clock = new AtomicLong();
        DataSource target = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement statement = mock(PreparedStatement.class);
        ResultSet result = mock(ResultSet.class);
        SQLException failure = new SQLException("sensitive result");
        when(target.getConnection()).thenReturn(connection);
        when(connection.prepareStatement("select ?")).thenReturn(statement);
        when(statement.executeQuery()).thenReturn(result);
        when(result.next()).thenAnswer(call -> {
            clock.addAndGet(5_000_000);
            throw failure;
        });
        doAnswer(call -> {
            clock.addAndGet(2_000_000);
            throw failure;
        }).when(result)
                .close();
        DataSource proxy = ProxyDataSourceBuilder.create(target)
                .proxyResultSet()
                .listener(new JdbcTimingListener(clock::get))
                .build();
        RequestJdbcTiming timing = new RequestJdbcTiming(0);

        // when & then
        try (RequestJdbcTimingContext ignored = RequestJdbcTimingContext.open(timing);
                Connection borrowed = proxy.getConnection()) {
            ResultSet rows = borrowed.prepareStatement("select ?")
                    .executeQuery();
            assertThatThrownBy(rows::next).isSameAs(failure);
            assertThatThrownBy(rows::close).isSameAs(failure);
        }
        assertThat(
                timing.phases()
                        .failures()
        ).isEqualTo(2);
        assertThat(
                timing.phases()
                        .openResultSets()
        ).isEqualTo(1);
        assertThat(
                timing.phases()
                        .resultSetMs()
        ).isZero();
        assertThat(
                timing.phases()
                        .resultSets(clock.get())
                        .getFirst()
                        .closed()
        ).isFalse();
        assertThat(
                timing.phases()
                        .resultSetJdbcMs()
        ).isEqualTo(7);
    }
}
