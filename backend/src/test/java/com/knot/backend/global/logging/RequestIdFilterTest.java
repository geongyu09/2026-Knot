package com.knot.backend.global.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.servlet.DispatcherType;
import jakarta.servlet.ServletException;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestIdFilterTest {
    private static final String VALID_ID = "0123456789abcdef0123456789abcdef";

    private final RequestIdFilter filter = new RequestIdFilter();

    @AfterEach
    void tearDown() {
        MDC.clear();
    }

    @Test
    @DisplayName("헤더가 없으면 요청 ID를 생성하고 종료 후 MDC를 정리한다")
    void filter_success_generatesId() throws Exception {
        // given
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        // when
        filter.doFilter(
                request,
                response,
                (
                        incoming,
                        outgoing
                ) -> assertThat(MDC.get("requestId")).matches("[0-9a-f]{32}")
                        .isEqualTo(response.getHeader("X-Request-ID"))
        );

        // then
        assertThat(response.getHeader("X-Request-ID")).matches("[0-9a-f]{32}");
        assertThat(MDC.get("requestId")).isNull();
    }

    @Test
    @DisplayName("유효한 단일 ID를 유지하고 기존 MDC와 다른 키를 복원한다")
    void filter_success_restoresContext() throws Exception {
        // given
        MockHttpServletRequest request = requestWithId(VALID_ID);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MDC.put(
                "requestId",
                "outer-context"
        );
        MDC.put(
                "other",
                "untouched"
        );

        // when
        filter.doFilter(
                request,
                response,
                (
                        incoming,
                        outgoing
                ) -> assertThat(MDC.get("requestId")).isEqualTo(VALID_ID)
        );

        // then
        assertThat(response.getHeaders("X-Request-ID")).containsExactly(VALID_ID);
        assertThat(MDC.get("requestId")).isEqualTo("outer-context");
        assertThat(MDC.get("other")).isEqualTo("untouched");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "short", "0123456789ABCDEF0123456789ABCDEF", "0123456789abcdef0123456789abcdef0",
            "0123456789abcdef0123456789abcdef\n", "0123456789abcdef0123456789abcdef,other"})
    @DisplayName("빈 값·잘못된 길이·대문자·제어 문자·쉼표 값은 새 ID로 대체한다")
    void filter_success_replacesInvalidId(String invalidId) throws Exception {
        // given
        MockHttpServletRequest request = requestWithId(invalidId);
        MockHttpServletResponse response = new MockHttpServletResponse();

        // when
        filter.doFilter(
                request,
                response,
                (
                        incoming,
                        outgoing
                ) -> assertThat(MDC.get("requestId")).matches("[0-9a-f]{32}")
                        .isNotEqualTo(invalidId)
        );

        // then
        assertThat(response.getHeader("X-Request-ID")).matches("[0-9a-f]{32}");
        assertThat(MDC.get("requestId")).isNull();
    }

    @Test
    @DisplayName("중복 요청 ID 헤더를 신뢰하지 않는다")
    void filter_success_replacesDuplicateHeaders() throws Exception {
        // given
        MockHttpServletRequest request = requestWithId(VALID_ID);
        request.addHeader(
                "X-Request-ID",
                VALID_ID
        );
        MockHttpServletResponse response = new MockHttpServletResponse();

        // when
        filter.doFilter(
                request,
                response,
                (
                        incoming,
                        outgoing
                ) -> assertThat(MDC.get("requestId")).isNotEqualTo(VALID_ID)
        );

        // then
        assertThat(response.getHeader("X-Request-ID")).matches("[0-9a-f]{32}");
    }

    @Test
    @DisplayName("하위 필터 예외에도 요청 ID 헤더와 MDC 복원 계약을 유지한다")
    void filter_failure_restoresContext() {
        // given
        MockHttpServletResponse response = new MockHttpServletResponse();
        MDC.put(
                "requestId",
                "previous"
        );

        // when & then
        assertThatThrownBy(
                () -> filter.doFilter(
                        requestWithId(VALID_ID),
                        response,
                        (
                                incoming,
                                outgoing
                        ) -> {
                            assertThat(MDC.get("requestId")).isEqualTo(VALID_ID);
                            throw new ServletException("failure");
                        }
                )
        ).isInstanceOf(ServletException.class);

        assertThat(MDC.get("requestId")).isEqualTo("previous");
        assertThat(response.getHeader("X-Request-ID")).isEqualTo(VALID_ID);
    }

    @ParameterizedTest
    @ValueSource(strings = {"ASYNC", "ERROR"})
    @DisplayName("비동기·오류 재진입은 최초 요청 ID를 재사용한다")
    void filter_success_reusesIdForDispatch(String dispatcher) throws Exception {
        // given
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(
                request,
                response,
                (
                        incoming,
                        outgoing
                ) -> {
                }
        );
        String original = response.getHeader("X-Request-ID");
        request.setDispatcherType(DispatcherType.valueOf(dispatcher));
        request.setAttribute(
                "jakarta.servlet.error.request_uri",
                "/test"
        );
        request.addHeader(
                "X-Request-ID",
                VALID_ID
        );

        // when
        filter.doFilter(
                request,
                response,
                (
                        incoming,
                        outgoing
                ) -> assertThat(MDC.get("requestId")).isEqualTo(original)
        );

        // then
        assertThat(response.getHeader("X-Request-ID")).isEqualTo(original);
        assertThat(MDC.get("requestId")).isNull();
    }

    @Test
    @DisplayName("같은 스레드의 중첩 오류 디스패치에서도 최초 ID를 유지한다")
    void filter_success_nestedErrorDispatch() throws Exception {
        // given
        MockHttpServletRequest request = requestWithId(VALID_ID);
        MockHttpServletResponse response = new MockHttpServletResponse();

        // when
        filter.doFilter(
                request,
                response,
                (
                        incoming,
                        outgoing
                ) -> {
                    request.setDispatcherType(DispatcherType.ERROR);
                    request.setAttribute(
                            "jakarta.servlet.error.request_uri",
                            "/test"
                    );
                    filter.doFilter(
                            request,
                            response,
                            (
                                    nestedRequest,
                                    nestedResponse
                            ) -> assertThat(MDC.get("requestId")).isEqualTo(VALID_ID)
                    );
                    assertThat(MDC.get("requestId")).isEqualTo(VALID_ID);
                }
        );

        assertThat(MDC.get("requestId")).isNull();
    }

    @Test
    @DisplayName("동시 요청과 스레드 재사용에서 요청 ID가 섞이지 않는다")
    void filter_success_isolatesThreads() throws Exception {
        // given
        CountDownLatch activeRequests = new CountDownLatch(2);

        // when & then
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<String> first = executor.submit(
                    () -> filterOnThread(
                            VALID_ID,
                            activeRequests
                    )
            );
            Future<String> second = executor.submit(
                    () -> filterOnThread(
                            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                            activeRequests
                    )
            );
            assertThat(first.get()).isEqualTo(VALID_ID);
            assertThat(second.get()).isEqualTo("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
            assertThat(
                    executor.submit(() -> MDC.get("requestId"))
                            .get()
            ).isNull();
        }
    }

    private String filterOnThread(
            String id,
            CountDownLatch activeRequests
    ) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(
                requestWithId(id),
                response,
                (
                        request,
                        outgoing
                ) -> {
                    activeRequests.countDown();
                    awaitConcurrentRequests(activeRequests);
                    assertThat(MDC.get("requestId")).isEqualTo(id);
                }
        );
        assertThat(MDC.get("requestId")).isNull();
        return response.getHeader("X-Request-ID");
    }

    private void awaitConcurrentRequests(CountDownLatch activeRequests) {
        try {
            assertThat(
                    activeRequests.await(
                            5,
                            TimeUnit.SECONDS
                    )
            ).isTrue();
        } catch (InterruptedException exception) {
            Thread.currentThread()
                    .interrupt();
            throw new AssertionError(exception);
        }
    }

    private MockHttpServletRequest requestWithId(String id) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(
                "X-Request-ID",
                id
        );
        return request;
    }
}
