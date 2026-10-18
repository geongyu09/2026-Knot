package com.knot.backend.global.logging;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.util.List;
import java.util.function.LongSupplier;
import java.util.stream.Collectors;
import net.ttddyy.dsproxy.ExecutionInfo;
import net.ttddyy.dsproxy.QueryInfo;
import net.ttddyy.dsproxy.listener.MethodExecutionContext;
import net.ttddyy.dsproxy.listener.lifecycle.JdbcLifecycleEventListenerAdapter;
import org.springframework.util.DigestUtils;

public final class JdbcTimingListener extends JdbcLifecycleEventListenerAdapter {
    private static final String START = JdbcTimingListener.class.getName() + ".start";

    private final LongSupplier nanoTime;

    public JdbcTimingListener(LongSupplier nanoTime) {
        this.nanoTime = nanoTime;
    }

    @Override
    public void beforeGetConnection(MethodExecutionContext context) {
        if (RequestJdbcTimingContext.current() != null) {
            context.addCustomValue(
                    START,
                    nanoTime.getAsLong()
            );
        }
    }

    @Override
    public void afterGetConnection(MethodExecutionContext context) {
        Long started = context.getCustomValue(
                START,
                Long.class
        );
        RequestJdbcTiming timing = RequestJdbcTimingContext.current();
        if (started == null || timing == null) {
            return;
        }
        if (context.getThrown() != null) {
            timing.acquired(
                    "failed",
                    started,
                    nanoTime.getAsLong(),
                    false
            );
            return;
        }
        timing.acquired(
                context.getConnectionInfo()
                        .getConnectionId(),
                started,
                nanoTime.getAsLong(),
                true
        );
    }

    @Override
    public void afterClose(MethodExecutionContext context) {
        RequestJdbcTiming timing = RequestJdbcTimingContext.current();
        if (timing == null || !Connection.class.isInstance(context.getTarget())) {
            return;
        }
        timing.returned(
                context.getConnectionInfo()
                        .getConnectionId(),
                nanoTime.getAsLong(),
                context.getThrown() == null
        );
    }

    @Override
    public void beforeQuery(
            ExecutionInfo execution,
            List<QueryInfo> queries
    ) {
        if (RequestJdbcTimingContext.current() != null) {
            execution.addCustomValue(
                    START,
                    nanoTime.getAsLong()
            );
        }
    }

    @Override
    public void afterQuery(
            ExecutionInfo execution,
            List<QueryInfo> queries
    ) {
        Long started = execution.getCustomValue(
                START,
                Long.class
        );
        RequestJdbcTiming timing = RequestJdbcTimingContext.current();
        if (started == null || timing == null) {
            return;
        }
        long elapsed = nanoTime.getAsLong() - started;
        String sql = queries.stream()
                .map(QueryInfo::getQuery)
                .collect(Collectors.joining("\n"));
        String hash = DigestUtils.md5DigestAsHex(sql.getBytes(StandardCharsets.UTF_8));
        timing.executed(
                execution.getConnectionId(),
                hash,
                elapsed,
                execution.isSuccess()
        );
    }
}
