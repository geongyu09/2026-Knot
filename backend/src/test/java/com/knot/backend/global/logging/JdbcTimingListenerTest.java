package com.knot.backend.global.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.concurrent.atomic.AtomicLong;
import javax.sql.DataSource;
import net.ttddyy.dsproxy.support.ProxyDataSourceBuilder;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class JdbcTimingListenerTest {

    @Test
    @DisplayName("실제 JDBC 프록시 경계에서 획득 SQL 점유를 중복 없이 분리한다")
    void listener_success_separatesAcquisitionExecutionAndUsage() throws Exception {
        // given
        AtomicLong clock = new AtomicLong();
        DataSource target = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement statement = mock(PreparedStatement.class);
        when(target.getConnection()).thenAnswer(call -> {
            clock.addAndGet(20_000_000);
            return connection;
        });
        when(connection.prepareStatement("select ?")).thenAnswer(call -> {
            clock.addAndGet(5_000_000);
            return statement;
        });
        when(statement.execute()).thenAnswer(call -> {
            clock.addAndGet(30_000_000);
            return true;
        });
        DataSource proxy = ProxyDataSourceBuilder.create(target)
                .listener(new JdbcTimingListener(clock::get))
                .build();
        RequestJdbcTiming timing = new RequestJdbcTiming(0);

        // when
        try (RequestJdbcTimingContext ignored = RequestJdbcTimingContext.open(timing)) {
            Connection borrowed = proxy.getConnection();
            borrowed.prepareStatement("select ?")
                    .execute();
            clock.addAndGet(40_000_000);
            borrowed.close();
            clock.addAndGet(9_000_000);
            borrowed.close();
        }

        // then
        assertThat(timing.acquireMs()).isEqualTo(20);
        assertThat(timing.acquireCount()).isEqualTo(1);
        assertThat(timing.sqlMs()).isEqualTo(30);
        assertThat(timing.queryCount()).isEqualTo(1);
        assertThat(timing.usageMs()).isEqualTo(75);
        assertThat(timing.openConnections()).isZero();
        assertThat(timing.connections()).hasSize(1);
        assertThat(timing.queries()).hasSize(1);
        assertThat(
                timing.queries()
                        .getFirst()
                        .sqlHash()
        ).matches("[0-9a-f]{32}");
        assertThat(
                timing.queries()
                        .toString()
        ).doesNotContain("select ?");
        assertThat(RequestJdbcTimingContext.current()).isNull();
    }

    @Test
    @DisplayName("연결 획득 실패 시간도 남기고 원래 SQLException을 보존한다")
    void listener_failure_acquisitionTimeout() throws Exception {
        // given
        AtomicLong clock = new AtomicLong();
        SQLException timeout = new SQLException("secret-database-error");
        DataSource target = mock(DataSource.class);
        when(target.getConnection()).thenAnswer(call -> {
            clock.addAndGet(400_000_000);
            throw timeout;
        });
        DataSource proxy = ProxyDataSourceBuilder.create(target)
                .listener(new JdbcTimingListener(clock::get))
                .build();
        RequestJdbcTiming timing = new RequestJdbcTiming(0);

        // when & then
        try (RequestJdbcTimingContext ignored = RequestJdbcTimingContext.open(timing)) {
            assertThatThrownBy(proxy::getConnection).isSameAs(timeout);
        }
        assertThat(timing.acquireFailures()).isEqualTo(1);
        assertThat(timing.acquireMs()).isEqualTo(400);
        assertThat(timing.sqlMs()).isZero();
        assertThat(timing.usageMs()).isZero();
        assertThat(timing.openConnections()).isZero();
    }

    @Test
    @DisplayName("SQL 실패도 실행 시간과 실패 횟수에 포함하며 연결은 정상 반환한다")
    void listener_failure_sqlException() throws Exception {
        // given
        AtomicLong clock = new AtomicLong();
        DataSource target = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement statement = mock(PreparedStatement.class);
        when(target.getConnection()).thenReturn(connection);
        when(connection.prepareStatement("select ?")).thenReturn(statement);
        SQLException failure = new SQLException("sensitive statement details");
        when(statement.execute()).thenAnswer(call -> {
            clock.addAndGet(13_000_000);
            throw failure;
        });
        DataSource proxy = ProxyDataSourceBuilder.create(target)
                .listener(new JdbcTimingListener(clock::get))
                .build();
        RequestJdbcTiming timing = new RequestJdbcTiming(0);

        // when
        try (RequestJdbcTimingContext ignored = RequestJdbcTimingContext.open(timing);
                Connection borrowed = proxy.getConnection()) {
            assertThatThrownBy(
                    () -> borrowed.prepareStatement("select ?")
                            .execute()
            ).isSameAs(failure);
        }

        // then
        assertThat(timing.queryFailures()).isEqualTo(1);
        assertThat(timing.sqlMs()).isEqualTo(13);
        assertThat(timing.usageMs()).isEqualTo(13);
        assertThat(
                timing.queries()
                        .getFirst()
                        .success()
        ).isFalse();
        assertThat(timing.openConnections()).isZero();
    }

    @Test
    @DisplayName("요청 범위가 없으면 백그라운드 JDBC 실행을 다른 요청에 합치지 않는다")
    void listener_success_noRequestContext() throws Exception {
        // given
        DataSource target = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        when(target.getConnection()).thenReturn(connection);
        DataSource proxy = ProxyDataSourceBuilder.create(target)
                .listener(new JdbcTimingListener(System::nanoTime))
                .build();

        // when & then
        try (Connection ignored = proxy.getConnection()) {
            assertThat(RequestJdbcTimingContext.current()).isNull();
        }
    }
}
