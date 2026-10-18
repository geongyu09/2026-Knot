package com.knot.backend.global.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import jakarta.servlet.ServletException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestJdbcTimingFilterTest {
    private static final String ID = "0123456789abcdef0123456789abcdef";

    private final Logger logger = (Logger) LoggerFactory.getLogger(RequestJdbcTimingFilter.class);
    private final ListAppender<ILoggingEvent> appender = new ListAppender<>();

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
    @DisplayName("완료 로그는 기존 요청 ID와 합계를 남기며 쿼리 문자열과 쿠키를 노출하지 않는다")
    void filter_success_correlatesIdWithoutSensitiveInput() throws Exception {
        // given
        MockHttpServletRequest request = new MockHttpServletRequest(
                "GET",
                "/api/v1/workspaces/12/documents"
        );
        request.addHeader(
                "X-Request-ID",
                ID
        );
        request.addHeader(
                "Cookie",
                "secret-cookie"
        );
        request.setQueryString("myConfirmation=PENDING&secret=hidden");
        MockHttpServletResponse response = new MockHttpServletResponse();
        RequestJdbcTimingFilter filter = new RequestJdbcTimingFilter(
                0,
                () -> 0
        );

        // when
        new RequestIdFilter().doFilter(
                request,
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
                        ) -> RequestJdbcTimingContext.current()
                                .executed(
                                        "1",
                                        "safe-hash",
                                        3_000_000,
                                        true
                                )
                )
        );

        // then
        assertThat(appender.list).hasSize(1);
        ILoggingEvent event = appender.list.getFirst();
        assertThat(event.getMDCPropertyMap()).containsEntry(
                "requestId",
                ID
        );
        assertThat(event.getFormattedMessage()).contains(
                "api=document_list",
                "sql_count=1",
                "sql_ms=3.0",
                "result_set_ms=0.0",
                "open_result_sets=0",
                "phase_samples=[]"
        )
                .doesNotContain(
                        "secret-cookie",
                        "myConfirmation",
                        "hidden"
                );
        assertThat(response.getHeader("X-Request-ID")).isEqualTo(ID);
        assertThat(RequestJdbcTimingContext.current()).isNull();
    }

    @Test
    @DisplayName("예외가 발생해도 컨텍스트를 정리하고 SQL 실패를 기록한다")
    void filter_failure_cleansUpAfterException() {
        // given
        RequestJdbcTimingFilter filter = new RequestJdbcTimingFilter(
                500,
                () -> 0
        );
        MockHttpServletRequest request = new MockHttpServletRequest(
                "GET",
                "/api/v1/workspaces/12/documents/686"
        );

        // when & then
        assertThatThrownBy(
                () -> filter.doFilter(
                        request,
                        new MockHttpServletResponse(),
                        (
                                incoming,
                                outgoing
                        ) -> {
                            RequestJdbcTimingContext.current()
                                    .executed(
                                            "1",
                                            "hash",
                                            1_000_000,
                                            false
                                    );
                            throw new ServletException("failure");
                        }
                )
        ).isInstanceOf(ServletException.class);
        assertThat(RequestJdbcTimingContext.current()).isNull();
        assertThat(appender.list).hasSize(1);
        assertThat(
                appender.list.getFirst()
                        .getFormattedMessage()
        ).contains(
                "api=document_detail",
                "sql_failures=1"
        );
    }

    @Test
    @DisplayName("임계값 미만이어도 트랜잭션 종료 실패는 기록한다")
    void filter_failure_logsFastCompletionFailure() throws Exception {
        // given
        RequestJdbcTimingFilter filter = new RequestJdbcTimingFilter(
                500,
                () -> 0
        );
        MockHttpServletRequest request = new MockHttpServletRequest(
                "GET",
                "/api/v1/workspaces/12/documents"
        );

        // when
        filter.doFilter(
                request,
                new MockHttpServletResponse(),
                (
                        incoming,
                        outgoing
                ) -> RequestJdbcTimingContext.current()
                        .phases()
                        .operation(
                                "spring_commit",
                                null,
                                0,
                                0,
                                false
                        )
        );

        // then
        assertThat(appender.list).hasSize(1);
        assertThat(
                appender.list.getFirst()
                        .getFormattedMessage()
        ).contains(
                "phase_failures=1",
                "spring_commit"
        );
        assertThat(RequestJdbcTimingContext.current()).isNull();
    }

    @Test
    @DisplayName("기본 임계값 미만의 정상 요청과 대상 밖 API는 상세 로그를 남기지 않는다")
    void filter_success_excludesFastAndUnrelatedRequests() throws Exception {
        // given
        RequestJdbcTimingFilter filter = new RequestJdbcTimingFilter(
                500,
                () -> 0
        );

        // when
        filter.doFilter(
                new MockHttpServletRequest(
                        "GET",
                        "/api/v1/workspaces/12/documents"
                ),
                new MockHttpServletResponse(),
                (
                        incoming,
                        outgoing
                ) -> assertThat(RequestJdbcTimingContext.current()).isNotNull()
        );
        filter.doFilter(
                new MockHttpServletRequest(
                        "GET",
                        "/api/v1/search"
                ),
                new MockHttpServletResponse(),
                (
                        incoming,
                        outgoing
                ) -> assertThat(RequestJdbcTimingContext.current()).isNull()
        );
        filter.doFilter(
                new MockHttpServletRequest(
                        "POST",
                        "/api/v1/workspaces/12/documents"
                ),
                new MockHttpServletResponse(),
                (
                        incoming,
                        outgoing
                ) -> assertThat(RequestJdbcTimingContext.current()).isNull()
        );

        // then
        assertThat(appender.list).isEmpty();
    }
}
