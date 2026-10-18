package com.knot.backend.global.logging;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.List;
import java.util.Set;
import java.util.function.LongSupplier;
import java.util.stream.Collectors;
import net.ttddyy.dsproxy.ExecutionInfo;
import net.ttddyy.dsproxy.QueryInfo;
import net.ttddyy.dsproxy.listener.MethodExecutionContext;
import net.ttddyy.dsproxy.listener.lifecycle.JdbcLifecycleEventListenerAdapter;
import org.springframework.util.DigestUtils;

public final class JdbcTimingListener extends JdbcLifecycleEventListenerAdapter {
    private static final String START = JdbcTimingListener.class.getName() + ".start";
    private static final String PHASE_START = JdbcTimingListener.class.getName() + ".phaseStart";
    private static final Set<String> INTERNAL_METHODS = Set.of(
            "getTarget",
            "getProxyConfig",
            "equals",
            "hashCode",
            "toString"
    );
    private static final Set<String> CONNECTION_PHASES = Set.of(
            "commit",
            "rollback",
            "close",
            "setAutoCommit",
            "setReadOnly",
            "setTransactionIsolation"
    );

    private final LongSupplier nanoTime;

    public JdbcTimingListener(LongSupplier nanoTime) {
        this.nanoTime = nanoTime;
    }

    @Override
    public void beforeMethod(MethodExecutionContext context) {
        if (RequestJdbcTimingContext.current() == null || !isPhaseMethod(context)) {
            return;
        }
        context.addCustomValue(
                PHASE_START,
                nanoTime.getAsLong()
        );
    }

    @Override
    public void afterMethod(MethodExecutionContext context) {
        RequestJdbcTiming timing = RequestJdbcTimingContext.current();
        if (timing == null) {
            return;
        }
        long finished = nanoTime.getAsLong();
        recordPhase(
                context,
                timing.phases(),
                finished
        );
        if (!Statement.class.isInstance(context.getTarget())) {
            return;
        }
        if (context.getThrown() == null && ResultSet.class.isInstance(context.getResult())) {
            timing.phases()
                    .opened(
                            ResultSet.class.cast(context.getResult()),
                            context.getConnectionInfo()
                                    .getConnectionId(),
                            finished
                    );
        }
    }

    private void recordPhase(
            MethodExecutionContext context,
            RequestJdbcPhases phases,
            long finished
    ) {
        Long started = context.getCustomValue(
                PHASE_START,
                Long.class
        );
        if (started == null) {
            return;
        }
        String method = context.getMethod()
                .getName();
        if (ResultSet.class.isInstance(context.getTarget())) {
            phases.resultCalled(
                    ResultSet.class.cast(context.getTarget()),
                    method,
                    finished - started,
                    finished,
                    "next".equals(method) && Boolean.TRUE.equals(context.getResult()),
                    context.getThrown() == null
            );
            return;
        }
        phases.operation(
                "jdbc_" + method,
                context.getConnectionInfo()
                        .getConnectionId(),
                started,
                finished,
                context.getThrown() == null
        );
    }

    private boolean isPhaseMethod(MethodExecutionContext context) {
        String method = context.getMethod()
                .getName();
        if (ResultSet.class.isInstance(context.getTarget())) {
            return !INTERNAL_METHODS.contains(method);
        }
        if (!Connection.class.isInstance(context.getTarget())) {
            return false;
        }
        return CONNECTION_PHASES.contains(method);
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
        long finished = nanoTime.getAsLong();
        long elapsed = finished - started;
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
        if (execution.isSuccess() && ResultSet.class.isInstance(execution.getResult())) {
            timing.phases()
                    .opened(
                            ResultSet.class.cast(execution.getResult()),
                            execution.getConnectionId(),
                            finished
                    );
        }
    }
}
