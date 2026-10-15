package com.knot.backend.global.logging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Enumeration;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.filter.OncePerRequestFilter;

public class RequestIdFilter extends OncePerRequestFilter {
    public static final String HEADER = "X-Request-ID";
    private static final String ATTRIBUTE = RequestIdFilter.class.getName() + ".requestId";
    private static final Pattern VALID_ID = Pattern.compile("[0-9a-f]{32}");
    private static final Logger log = LoggerFactory.getLogger(RequestIdFilter.class);

    @Override
    protected boolean shouldNotFilterAsyncDispatch() {
        return false;
    }

    @Override
    protected boolean shouldNotFilterErrorDispatch() {
        return false;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain chain
    ) throws ServletException, IOException {
        String requestId = resolveRequestId(request);
        if (!response.isCommitted()) {
            response.setHeader(
                    HEADER,
                    requestId
            );
        }
        try (RequestIdContext ignored = RequestIdContext.open(requestId)) {
            try {
                chain.doFilter(
                        request,
                        response
                );
            } finally {
                log.info(
                        "HTTP dispatch finished method={} status={} dispatch={} async_started={}",
                        request.getMethod(),
                        response.getStatus(),
                        request.getDispatcherType(),
                        request.isAsyncStarted()
                );
            }
        }
    }

    @Override
    protected void doFilterNestedErrorDispatch(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain chain
    ) throws ServletException, IOException {
        doFilterInternal(
                request,
                response,
                chain
        );
    }

    private String resolveRequestId(HttpServletRequest request) {
        String existing = (String) request.getAttribute(ATTRIBUTE);
        if (existing != null) {
            return existing;
        }
        String requestId = readSingleValidHeader(request);
        request.setAttribute(
                ATTRIBUTE,
                requestId
        );
        return requestId;
    }

    private String readSingleValidHeader(HttpServletRequest request) {
        Enumeration<String> values = request.getHeaders(HEADER);
        if (values == null || !values.hasMoreElements()) {
            return generateRequestId();
        }
        String value = values.nextElement();
        if (values.hasMoreElements()) {
            return generateRequestId();
        }
        if (value == null || value.length() != 32) {
            return generateRequestId();
        }
        if (!VALID_ID.matcher(value)
                .matches()) {
            return generateRequestId();
        }
        return value;
    }

    private String generateRequestId() {
        return UUID.randomUUID()
                .toString()
                .replace(
                        "-",
                        ""
                );
    }
}
