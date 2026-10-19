package com.knot.backend.global.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.TransactionSystemException;

class TransactionTimingPostProcessorTest {

    @Test
    @DisplayName("Spring 커밋과 롤백의 반환 정리를 포함한 전체 호출을 기록한다")
    void postProcessor_success_measuresCompletionWithoutChangingStatus() {
        // given
        AtomicLong clock = new AtomicLong();
        PlatformTransactionManager target = mock(PlatformTransactionManager.class);
        TransactionStatus status = mock(TransactionStatus.class);
        doAnswer(call -> {
            clock.addAndGet(13_000_000);
            return null;
        }).when(target)
                .commit(status);
        doAnswer(call -> {
            clock.addAndGet(17_000_000);
            return null;
        }).when(target)
                .rollback(status);
        PlatformTransactionManager proxy = PlatformTransactionManager.class.cast(
                new TransactionTimingPostProcessor(clock::get).postProcessAfterInitialization(
                        target,
                        "tx"
                )
        );
        RequestJdbcTiming timing = new RequestJdbcTiming(0);

        // when
        try (RequestJdbcTimingContext ignored = RequestJdbcTimingContext.open(timing)) {
            proxy.commit(status);
            proxy.rollback(status);
        }

        // then
        assertThat(
                timing.phases()
                        .operationMs()
        ).containsEntry(
                "spring_commit",
                13.0
        )
                .containsEntry(
                        "spring_rollback",
                        17.0
                );
        assertThat(
                timing.phases()
                        .failures()
        ).isZero();
        verify(target).commit(status);
        verify(target).rollback(status);
    }

    @Test
    @DisplayName("트랜잭션 종료 실패를 기록하고 원래 예외를 그대로 전달한다")
    void postProcessor_failure_preservesCompletionException() {
        // given
        AtomicLong clock = new AtomicLong();
        PlatformTransactionManager target = mock(PlatformTransactionManager.class);
        TransactionStatus status = mock(TransactionStatus.class);
        TransactionSystemException failure = new TransactionSystemException("sensitive failure");
        doAnswer(call -> {
            clock.addAndGet(19_000_000);
            throw failure;
        }).when(target)
                .commit(status);
        PlatformTransactionManager proxy = PlatformTransactionManager.class.cast(
                new TransactionTimingPostProcessor(clock::get).postProcessAfterInitialization(
                        target,
                        "tx"
                )
        );
        RequestJdbcTiming timing = new RequestJdbcTiming(0);

        // when & then
        try (RequestJdbcTimingContext ignored = RequestJdbcTimingContext.open(timing)) {
            assertThatThrownBy(() -> proxy.commit(status)).isSameAs(failure);
        }
        assertThat(
                timing.phases()
                        .failures()
        ).isEqualTo(1);
        assertThat(
                timing.phases()
                        .operations()
                        .getFirst()
                        .success()
        ).isFalse();
        assertThat(
                timing.phases()
                        .operations()
                        .toString()
        ).doesNotContain("sensitive failure");
    }

    @Test
    @DisplayName("요청 컨텍스트 밖 트랜잭션과 일반 Bean 동작을 보존한다")
    void postProcessor_success_unrelatedBeanAndNoContext() {
        // given
        TransactionTimingPostProcessor processor = new TransactionTimingPostProcessor(System::nanoTime);
        PlatformTransactionManager target = mock(PlatformTransactionManager.class);
        TransactionStatus status = mock(TransactionStatus.class);
        PlatformTransactionManager proxy = PlatformTransactionManager.class.cast(
                processor.postProcessAfterInitialization(
                        target,
                        "tx"
                )
        );

        // when
        proxy.commit(status);

        // then
        verify(target).commit(status);
        assertThat(
                processor.postProcessAfterInitialization(
                        status,
                        "unrelated"
                )
        ).isSameAs(status);
        assertThat(RequestJdbcTimingContext.current()).isNull();
    }
}
