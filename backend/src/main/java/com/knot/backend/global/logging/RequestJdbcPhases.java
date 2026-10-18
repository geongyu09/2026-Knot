package com.knot.backend.global.logging;

import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import net.ttddyy.dsproxy.proxy.ProxyJdbcObject;

public final class RequestJdbcPhases {
    private static final int SAMPLE_LIMIT = 64;

    private final long requestStarted;
    private final Map<ResultSet, JdbcResultSetObservation> openResults = new IdentityHashMap<>();
    private final Map<String, Integer> latestQueries = new HashMap<>();
    private final List<JdbcResultSetTiming> results = new ArrayList<>();
    private final List<JdbcOperationTiming> operations = new ArrayList<>();
    private final Map<String, Double> operationMs = new HashMap<>();
    private final Map<String, Integer> operationCounts = new HashMap<>();
    private double resultSetMs;
    private long resultSetJdbcNanos;
    private int resultSetCount;
    private int failures;
    private int operationCount;
    private Long lastResultClosed;

    RequestJdbcPhases(long requestStarted) {
        this.requestStarted = requestStarted;
    }

    void queryExecuted(
            String connectionId,
            int sequence
    ) {
        latestQueries.put(
                connectionId,
                sequence
        );
    }

    void opened(
            ResultSet resultSet,
            String connectionId,
            long now
    ) {
        ResultSet target = original(resultSet);
        if (openResults.containsKey(target)) {
            return;
        }
        openResults.put(
                target,
                new JdbcResultSetObservation(
                        latestQueries.getOrDefault(
                                connectionId,
                                0
                        ),
                        connectionId,
                        requestStarted,
                        now
                )
        );
        resultSetCount++;
    }

    void resultCalled(
            ResultSet target,
            String method,
            long elapsed,
            long finished,
            boolean row,
            boolean success
    ) {
        JdbcResultSetObservation observation = openResults.get(target);
        if (observation == null) {
            return;
        }
        observation.called(
                elapsed,
                row,
                success
        );
        resultSetJdbcNanos += elapsed;
        if (!success) {
            failures++;
            return;
        }
        if (!"close".equals(method)) {
            return;
        }
        openResults.remove(target);
        lastResultClosed = finished;
        JdbcResultSetTiming snapshot = observation.snapshot(
                finished,
                true
        );
        resultSetMs += snapshot.spanMs();
        if (results.size() < SAMPLE_LIMIT) {
            results.add(snapshot);
        }
    }

    void operation(
            String name,
            String connectionId,
            long started,
            long finished,
            boolean success
    ) {
        double elapsed = (finished - started) / 1_000_000.0;
        operationCount++;
        operationMs.merge(
                name,
                elapsed,
                Double::sum
        );
        operationCounts.merge(
                name,
                1,
                Integer::sum
        );
        if (!success) {
            failures++;
        }
        if (operations.size() < SAMPLE_LIMIT) {
            operations.add(
                    new JdbcOperationTiming(
                            name,
                            connectionId,
                            (started - requestStarted) / 1_000_000.0,
                            elapsed,
                            success,
                            queryTailMs(
                                    name,
                                    started,
                                    finished
                            )
                    )
            );
        }
    }

    private Double queryTailMs(
            String name,
            long started,
            long finished
    ) {
        if (!name.startsWith("query_") || lastResultClosed == null) {
            return null;
        }
        if (lastResultClosed < started || lastResultClosed > finished) {
            return null;
        }
        return (finished - lastResultClosed) / 1_000_000.0;
    }

    public double resultSetMs() {
        return resultSetMs;
    }

    public double resultSetJdbcMs() {
        return resultSetJdbcNanos / 1_000_000.0;
    }

    public int resultSetCount() {
        return resultSetCount;
    }

    public int openResultSets() {
        return openResults.size();
    }

    public int failures() {
        return failures;
    }

    public int operationCount() {
        return operationCount;
    }

    public Map<String, Double> operationMs() {
        return Map.copyOf(operationMs);
    }

    public Map<String, Integer> operationCounts() {
        return Map.copyOf(operationCounts);
    }

    public List<JdbcOperationTiming> operations() {
        return List.copyOf(operations);
    }

    public List<JdbcResultSetTiming> resultSets(long now) {
        List<JdbcResultSetTiming> snapshots = new ArrayList<>(results);
        for (JdbcResultSetObservation observation : openResults.values()) {
            if (snapshots.size() >= SAMPLE_LIMIT) {
                break;
            }
            snapshots.add(
                    observation.snapshot(
                            now,
                            false
                    )
            );
        }
        return List.copyOf(snapshots);
    }

    private ResultSet original(ResultSet resultSet) {
        if (ProxyJdbcObject.class.isInstance(resultSet)) {
            return ResultSet.class.cast(
                    ProxyJdbcObject.class.cast(resultSet)
                            .getTarget()
            );
        }
        return resultSet;
    }
}
