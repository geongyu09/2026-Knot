package com.knot.backend.auth.presentation.handler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Level;
import com.knot.backend.auth.application.AuthService;
import com.knot.backend.auth.presentation.AuthCookieManager;
import com.knot.backend.global.config.JwtProperties;
import com.knot.backend.testsupport.LogCapture;
import java.io.IOException;
import java.io.UncheckedIOException;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import tools.jackson.databind.json.JsonMapper;

class JwtLogoutLoggingTest {

    @Test
    @DisplayName("로그아웃 실패는 민감값 없는 원인 한 건과 기존 500 본문·실패 표식을 남긴다")
    void logout_failure_recordsInternalAndMaintainsResponse() throws Exception {
        AuthService service = mock(AuthService.class);
        doThrow(new IllegalStateException("private-refresh-token")).when(service)
                .logout(null);
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        try (LogCapture logs = new LogCapture(JwtLogoutHandler.class)) {
            handler(service).logout(
                    request,
                    response,
                    null
            );
            assertThat(response.getStatus()).isEqualTo(500);
            assertThat(response.getContentAsString()).contains("AUTHENTICATION_INTERNAL_ERROR")
                    .doesNotContain("private-refresh-token");
            assertThat(request.getAttribute(AuthLogoutSuccessHandler.LOGOUT_FAILURE_ATTRIBUTE)).isEqualTo(true);
            assertThat(logs.events()).singleElement()
                    .satisfies(event -> {
                        assertThat(event.getLevel()).isEqualTo(Level.ERROR);
                        assertThat(event.getFormattedMessage()).contains("IllegalStateException")
                                .doesNotContain("private-refresh-token");
                        assertThat(event.getThrowableProxy()).isNull();
                    });
        }
    }

    @Test
    @DisplayName("로그아웃 실패 응답 쓰기까지 실패하면 별도 IO 원인도 기록하고 기존 예외를 전파한다")
    void logout_failure_errorResponseWrite() throws Exception {
        AuthService service = mock(AuthService.class);
        doThrow(new IllegalStateException("private-refresh-token")).when(service)
                .logout(null);
        HttpServletResponse response = mock(HttpServletResponse.class);
        when(response.getWriter()).thenThrow(new IOException("private-write"));
        try (LogCapture logs = new LogCapture(JwtLogoutHandler.class)) {
            assertThatThrownBy(
                    () -> handler(service).logout(
                            new MockHttpServletRequest(),
                            response,
                            null
                    )
            ).isInstanceOf(UncheckedIOException.class)
                    .hasCauseInstanceOf(IOException.class);
            assertThat(logs.events()).hasSize(2)
                    .allSatisfy(event -> {
                        assertThat(event.getLevel()).isEqualTo(Level.ERROR);
                        assertThat(event.getFormattedMessage()).doesNotContain(
                                "private-refresh-token",
                                "private-write"
                        );
                    });
        }
    }

    private JwtLogoutHandler handler(AuthService service) {
        return new JwtLogoutHandler(
                new AuthCookieManager(new JwtProperties()),
                service,
                JsonMapper.builder()
                        .build()
        );
    }
}
