package com.knot.backend.global.logging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.function.LongSupplier;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.filter.OncePerRequestFilter;

public final class RequestJdbcTimingFilter extends OncePerRequestFilter {
    private static final Pattern DOCUMENT_GET = Pattern.compile("/api/v1/workspaces/[0-9]+/documents(?:/[0-9]+)?");
    private static final Logger log = LoggerFactory.getLogger(RequestJdbcTimingFilter.class);

    private final long slowRequestMs;
    private final LongSupplier nanoTime;

    public RequestJdbcTimingFilter(
            long slowRequestMs,
            LongSupplier nanoTime
    ) {
        this.slowRequestMs = slowRequestMs;
        this.nanoTime = nanoTime;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!"GET".equals(request.getMethod())) {
            return true;
        }
        return !DOCUMENT_GET.matcher(request.getRequestURI())
                .matches();
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain chain
    ) throws ServletException, IOException {
        RequestJdbcTiming timing = new RequestJdbcTiming(nanoTime.getAsLong());
        try (RequestJdbcTimingContext ignored = RequestJdbcTimingContext.open(timing)) {
            try {
                chain.doFilter(
                        request,
                        response
                );
            } finally {
                writeTiming(
                        request,
                        response,
                        timing
                );
            }
        }
    }

    private void writeTiming(
            HttpServletRequest request,
            HttpServletResponse response,
            RequestJdbcTiming timing
    ) {
        long finished = nanoTime.getAsLong();
        double elapsed = timing.elapsedMs(finished);
        RequestJdbcPhases phases = timing.phases();
        if (elapsed < slowRequestMs && timing.acquireFailures() == 0 && timing.queryFailures() == 0
                && phases.failures() == 0) {
            return;
        }
        log.info(
                "DB_REQUEST_TIMING api={} status={} request_ms={} acquire_count={} acquire_failures={} acquire_ms={} acquire_max_ms={} usage_ms={} usage_max_ms={} open_connections={} sql_count={} sql_failures={} sql_ms={} sql_max_ms={} connections={} sql_samples={} result_set_count={} result_set_ms={} result_set_jdbc_ms={} open_result_sets={} phase_failures={} phase_count={} phase_counts={} phase_ms={} result_set_samples={} phase_samples={}",
                apiName(request),
                response.getStatus(),
                elapsed,
                timing.acquireCount(),
                timing.acquireFailures(),
                timing.acquireMs(),
                timing.acquireMaxMs(),
                timing.usageMs(),
                timing.usageMaxMs(),
                timing.openConnections(),
                timing.queryCount(),
                timing.queryFailures(),
                timing.sqlMs(),
                timing.sqlMaxMs(),
                timing.connections(),
                timing.queries(),
                phases.resultSetCount(),
                phases.resultSetMs(),
                phases.resultSetJdbcMs(),
                phases.openResultSets(),
                phases.failures(),
                phases.operationCount(),
                phases.operationCounts(),
                phases.operationMs(),
                phases.resultSets(finished),
                phases.operations()
        );
    }

    private String apiName(HttpServletRequest request) {
        if (request.getRequestURI()
                .endsWith("/documents")) {
            return "document_list";
        }
        return "document_detail";
    }
}
