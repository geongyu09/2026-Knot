package com.knot.backend.auth.infrastructure.jwt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

import ch.qos.logback.classic.Level;
import com.knot.backend.auth.domain.AuthTokenProvider;
import com.knot.backend.auth.domain.AuthErrorCode;
import com.knot.backend.auth.domain.AuthException;
import com.knot.backend.global.config.JwtProperties;
import com.knot.backend.testsupport.LogCapture;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

class JwtFilterLoggingTest {

    @Test
    @DisplayName("JWT 필터가 소비하는 INVALID_JWT 안의 내부 원인을 기록하고 기존 익명 흐름을 유지한다")
    void doFilter_failure_internalCause() throws Exception {
        AuthTokenProvider provider = mock(AuthTokenProvider.class);
        when(provider.authenticate("private-jwt")).thenThrow(
                new AuthException(
                        AuthErrorCode.INVALID_JWT,
                        new IllegalStateException("private-sql")
                )
        );
        JwtProperties properties = new JwtProperties();
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(
                new Cookie(
                        properties.getCookieName(),
                        "private-jwt"
                )
        );
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);
        try (LogCapture logs = new LogCapture(JwtAuthenticationFilter.class)) {
            new JwtAuthenticationFilter(
                    provider,
                    properties
            ).doFilter(
                    request,
                    response,
                    chain
            );
            assertThat(
                    SecurityContextHolder.getContext()
                            .getAuthentication()
            ).isNull();
            assertThat(logs.events()).singleElement()
                    .satisfies(event -> {
                        assertThat(event.getLevel()).isEqualTo(Level.ERROR);
                        assertThat(event.getFormattedMessage()).contains("IllegalStateException")
                                .doesNotContain(
                                        "private-jwt",
                                        "private-sql"
                                );
                    });
        } finally {
            SecurityContextHolder.clearContext();
        }
        verify(chain).doFilter(
                request,
                response
        );
    }
}
