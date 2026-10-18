package com.knot.backend.global.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.knot.backend.testsupport.TestApplicationProperties;
import com.knot.backend.testsupport.TestcontainersConfiguration;
import com.knot.backend.document.application.DocumentListQuery;
import com.knot.backend.document.application.dto.query.DocumentListParameters;
import com.knot.backend.document.domain.model.MyConfirmationState;
import com.zaxxer.hikari.HikariDataSource;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.servlet.ServletException;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;
import net.ttddyy.dsproxy.support.ProxyDataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.boot.micrometer.metrics.test.autoconfigure.AutoConfigureMetrics;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestConstructor;
import org.springframework.orm.jpa.EntityManagerFactoryUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Tag("integration")
@ActiveProfiles({"dev", "observability"})
@Import(TestcontainersConfiguration.class)
@TestApplicationProperties
@SpringBootTest(properties = {"spring.datasource.hikari.maximum-pool-size=2", "spring.datasource.hikari.minimum-idle=2",
        "spring.datasource.hikari.connection-timeout=3000"})
@AutoConfigureMetrics
@TestConstructor(autowireMode = TestConstructor.AutowireMode.ALL)
class RequestJdbcTimingIntegrationTest {
    private static final String ID = "0123456789abcdef0123456789abcdef";

    private final DataSource dataSource;
    private final EntityManagerFactory entityManagerFactory;
    private final MeterRegistry registry;
    private final PlatformTransactionManager transactionManager;
    private final DocumentListQuery documentListQuery;
    private final Logger logger = (Logger) LoggerFactory.getLogger(RequestJdbcTimingFilter.class);
    private final ListAppender<ILoggingEvent> appender = new ListAppender<>();

    RequestJdbcTimingIntegrationTest(
            DataSource dataSource,
            EntityManagerFactory entityManagerFactory,
            MeterRegistry registry,
            PlatformTransactionManager transactionManager,
            DocumentListQuery documentListQuery
    ) {
        this.dataSource = dataSource;
        this.entityManagerFactory = entityManagerFactory;
        this.registry = registry;
        this.transactionManager = transactionManager;
        this.documentListQuery = documentListQuery;
    }

    @BeforeEach
    void setUp() {
        appender.start();
        logger.addAppender(appender);
    }

    @AfterEach
    void tearDown() {
        logger.detachAppender(appender);
        appender.stop();
    }

    @Test
    @DisplayName("실제 PostgreSQL Hibernate 실행과 반환을 요청 ID로 연결하고 기존 Hikari 지표를 유지한다")
    void filter_success_realHibernateAndPoolMetrics() throws Exception {
        // given
        AtomicReference<RequestJdbcTiming> captured = new AtomicReference<>();
        RequestJdbcTimingFilter filter = new RequestJdbcTimingFilter(
                0,
                System::nanoTime
        );
        MockHttpServletResponse response = new MockHttpServletResponse();

        // when
        new RequestIdFilter().doFilter(
                request(),
                response,
                (
                        incoming,
                        outgoing
                ) -> filter.doFilter(
                        incoming,
                        outgoing,
                        (
                                accepted,
                                returned
                        ) -> {
                            captured.set(RequestJdbcTimingContext.current());
                            EntityManager entityManager = entityManagerFactory.createEntityManager();
                            try {
                                entityManager.getTransaction()
                                        .begin();
                                assertThat(
                                        entityManager.createNativeQuery("SELECT 1 FROM pg_sleep(0.03)")
                                                .getSingleResult()
                                ).isEqualTo(1);
                                entityManager.getTransaction()
                                        .commit();
                            } finally {
                                entityManager.close();
                            }
                        }
                )
        );

        // then
        RequestJdbcTiming timing = captured.get();
        assertThat(dataSource).isInstanceOf(ProxyDataSource.class);
        assertThat(
                dataSource.unwrap(HikariDataSource.class)
                        .getMaximumPoolSize()
        ).isEqualTo(2);
        assertThat(timing.queryCount()).isEqualTo(1);
        assertThat(timing.sqlMs()).isGreaterThanOrEqualTo(25);
        assertThat(timing.usageMs()).isGreaterThanOrEqualTo(timing.sqlMs());
        assertThat(timing.acquireCount()).isEqualTo(1);
        assertThat(timing.openConnections()).isZero();
        assertThat(appender.list).hasSize(1);
        assertThat(
                appender.list.getFirst()
                        .getMDCPropertyMap()
        ).containsEntry(
                "requestId",
                ID
        );
        assertThat(
                appender.list.getFirst()
                        .getFormattedMessage()
        ).contains(
                "sql_count=1",
                "open_connections=0"
        );
        assertThat(
                registry.find("hikaricp.connections.acquire")
                        .timer()
        ).isNotNull();
        assertThat(
                registry.find("hikaricp.connections.acquire")
                        .timer()
                        .count()
        ).isPositive();
        assertThat(
                registry.find("hikaricp.connections.usage")
                        .timer()
        ).isNotNull();
        assertThat(
                registry.find("jdbc.connections.max")
                        .gauge()
        ).isNotNull();
        assertThat(response.getHeader("X-Request-ID")).isEqualTo(ID);
    }

    @Test
    @DisplayName("실제 Hibernate 결과 소비와 Spring 커밋 정리 및 연결 반환이 요청 로그에 기록된다")
    void filter_success_realResultConsumptionAndSpringCompletion() throws Exception {
        // given
        AtomicReference<RequestJdbcTiming> captured = new AtomicReference<>();
        RequestJdbcTimingFilter filter = new RequestJdbcTimingFilter(
                0,
                System::nanoTime
        );
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        transaction.setReadOnly(true);

        // when
        new RequestIdFilter().doFilter(
                request(),
                new MockHttpServletResponse(),
                (
                        incoming,
                        outgoing
                ) -> filter.doFilter(
                        incoming,
                        outgoing,
                        (
                                accepted,
                                returned
                        ) -> {
                            captured.set(RequestJdbcTimingContext.current());
                            transaction.executeWithoutResult(status -> {
                                EntityManager entityManager = EntityManagerFactoryUtils
                                        .getTransactionalEntityManager(entityManagerFactory);
                                assertThat(entityManager).isNotNull();
                                List<?> rows = entityManager.createNativeQuery("SELECT i FROM generate_series(1, 3) i")
                                        .getResultList();
                                assertThat(rows).hasSize(3);
                                assertThat(
                                        documentListQuery.findTopics(
                                                Long.MAX_VALUE,
                                                Long.MAX_VALUE,
                                                DocumentListParameters.of(
                                                        null,
                                                        100,
                                                        MyConfirmationState.PENDING,
                                                        null
                                                )
                                        )
                                ).isEmpty();
                            });
                        }
                )
        );

        // then
        RequestJdbcTiming timing = captured.get();
        assertThat(
                timing.phases()
                        .resultSetCount()
        ).isEqualTo(2);
        assertThat(
                timing.phases()
                        .openResultSets()
        ).isZero();
        assertThat(
                timing.phases()
                        .resultSets(System.nanoTime())
        ).allSatisfy(sample -> {
            assertThat(sample.closed()).isTrue();
            assertThat(sample.spanMs()).isGreaterThanOrEqualTo(sample.jdbcMs());
        });
        assertThat(
                timing.phases()
                        .resultSets(System.nanoTime())
                        .getFirst()
                        .rows()
        ).isEqualTo(3);
        assertThat(
                timing.phases()
                        .operationMs()
        ).containsKeys(
                "spring_commit",
                "jdbc_commit",
                "jdbc_close",
                "query_list_findTopics"
        );
        assertThat(
                timing.phases()
                        .operationMs()
                        .get("spring_commit")
        ).isGreaterThanOrEqualTo(
                timing.phases()
                        .operationMs()
                        .get("jdbc_commit")
                        + timing.phases()
                                .operationMs()
                                .get("jdbc_close")
        );
        assertThat(timing.openConnections()).isZero();
        assertThat(
                timing.phases()
                        .failures()
        ).isZero();
        assertThat(
                appender.list.getFirst()
                        .getFormattedMessage()
        ).contains(
                "result_set_count=2",
                "spring_commit",
                "jdbc_close",
                "query_list_findTopics"
        );
        assertThat(
                appender.list.getFirst()
                        .getMDCPropertyMap()
        ).containsEntry(
                "requestId",
                ID
        );
    }

    @Test
    @DisplayName("실제 Spring 롤백에서도 JDBC 롤백과 반환 시간을 기록하고 원래 예외를 전달한다")
    void filter_failure_realSpringRollback() {
        // given
        AtomicReference<RequestJdbcTiming> captured = new AtomicReference<>();
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        IllegalStateException failure = new IllegalStateException("private rollback reason");

        // when & then
        assertThatThrownBy(
                () -> new RequestJdbcTimingFilter(
                        0,
                        System::nanoTime
                ).doFilter(
                        request(),
                        new MockHttpServletResponse(),
                        (
                                incoming,
                                outgoing
                        ) -> {
                            captured.set(RequestJdbcTimingContext.current());
                            transaction.executeWithoutResult(status -> {
                                EntityManager entityManager = EntityManagerFactoryUtils
                                        .getTransactionalEntityManager(entityManagerFactory);
                                assertThat(entityManager).isNotNull();
                                entityManager.createNativeQuery("SELECT 1")
                                        .getSingleResult();
                                throw failure;
                            });
                        }
                )
        ).isSameAs(failure);
        assertThat(
                captured.get()
                        .phases()
                        .operationMs()
        ).containsKeys(
                "spring_rollback",
                "jdbc_rollback",
                "jdbc_close"
        );
        assertThat(
                captured.get()
                        .openConnections()
        ).isZero();
        assertThat(RequestJdbcTimingContext.current()).isNull();
    }

    @Test
    @DisplayName("실제 Hikari 풀 대기는 SQL 실행과 별도 획득 시간으로 기록한다")
    void filter_success_realPoolWaitSeparatedFromSql() throws Exception {
        // given
        HikariDataSource pool = dataSource.unwrap(HikariDataSource.class);
        CountDownLatch started = new CountDownLatch(1);
        RequestJdbcTimingFilter filter = new RequestJdbcTimingFilter(
                0,
                System::nanoTime
        );
        AtomicReference<RequestJdbcTiming> captured = new AtomicReference<>();
        Connection held = dataSource.getConnection();

        try (Connection otherHeld = dataSource.getConnection();
                ExecutorService executor = Executors.newSingleThreadExecutor()) {
            // when
            Future<?> request = executor.submit(() -> {
                try {
                    new RequestIdFilter().doFilter(
                            request(),
                            new MockHttpServletResponse(),
                            (
                                    incoming,
                                    outgoing
                            ) -> filter.doFilter(
                                    incoming,
                                    outgoing,
                                    (
                                            accepted,
                                            returned
                                    ) -> {
                                        captured.set(RequestJdbcTimingContext.current());
                                        started.countDown();
                                        try (Connection connection = dataSource.getConnection()) {
                                            connection.prepareStatement("SELECT 1 FROM pg_sleep(0.03)")
                                                    .execute();
                                        } catch (SQLException exception) {
                                            throw new ServletException(exception);
                                        }
                                    }
                            )
                    );
                } catch (Exception exception) {
                    throw new IllegalStateException(exception);
                }
            });
            assertThat(
                    started.await(
                            2,
                            TimeUnit.SECONDS
                    )
            ).isTrue();
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
            while (pool.getHikariPoolMXBean()
                    .getThreadsAwaitingConnection() == 0 && System.nanoTime() < deadline) {
                Thread.sleep(5);
            }
            assertThat(
                    pool.getHikariPoolMXBean()
                            .getThreadsAwaitingConnection()
            ).isEqualTo(1);
            Thread.sleep(120);
            held.close();
            request.get(
                    5,
                    TimeUnit.SECONDS
            );

            // then
            assertThat(
                    captured.get()
                            .acquireMs()
            ).isGreaterThanOrEqualTo(100);
            assertThat(
                    captured.get()
                            .sqlMs()
            ).isGreaterThanOrEqualTo(25);
            assertThat(
                    captured.get()
                            .openConnections()
            ).isZero();
            assertThat(appender.list).hasSize(1);
        } finally {
            held.close();
        }
    }

    @Test
    @DisplayName("실제 PostgreSQL SQL 오류에서도 실패와 연결 반환 시간을 남긴다")
    void filter_failure_realSqlError() {
        // given
        RequestJdbcTimingFilter filter = new RequestJdbcTimingFilter(
                0,
                System::nanoTime
        );
        AtomicReference<RequestJdbcTiming> captured = new AtomicReference<>();

        // when & then
        assertThatThrownBy(
                () -> new RequestIdFilter().doFilter(
                        request(),
                        new MockHttpServletResponse(),
                        (
                                incoming,
                                outgoing
                        ) -> filter.doFilter(
                                incoming,
                                outgoing,
                                (
                                        accepted,
                                        returned
                                ) -> {
                                    captured.set(RequestJdbcTimingContext.current());
                                    try (Connection connection = dataSource.getConnection()) {
                                        connection.prepareStatement("SELECT * FROM nonexistent_timing_test_table")
                                                .execute();
                                    } catch (SQLException exception) {
                                        throw new ServletException(exception);
                                    }
                                }
                        )
                )
        ).isInstanceOf(ServletException.class);
        assertThat(
                captured.get()
                        .queryFailures()
        ).isEqualTo(1);
        assertThat(
                captured.get()
                        .openConnections()
        ).isZero();
        assertThat(
                appender.list.getFirst()
                        .getFormattedMessage()
        ).contains("sql_failures=1")
                .doesNotContain("nonexistent_timing_test_table");
        assertThat(RequestJdbcTimingContext.current()).isNull();
    }

    private MockHttpServletRequest request() {
        MockHttpServletRequest request = new MockHttpServletRequest(
                "GET",
                "/api/v1/workspaces/12/documents"
        );
        request.addHeader(
                "X-Request-ID",
                ID
        );
        return request;
    }
}
