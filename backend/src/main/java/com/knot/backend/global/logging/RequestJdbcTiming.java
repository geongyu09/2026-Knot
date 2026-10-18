package com.knot.backend.global.logging;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class RequestJdbcTiming {
    private static final int SAMPLE_LIMIT = 64;

    private final long startedNanos;
    private final Map<String, Long> borrowedAt = new HashMap<>();
    private final Map<String, Double> acquisitionMs = new HashMap<>();
    private final List<JdbcConnectionTiming> connections = new ArrayList<>();
    private final List<JdbcQueryTiming> queries = new ArrayList<>();
    private long acquireNanos;
    private long acquireMaxNanos;
    private long usageNanos;
    private long usageMaxNanos;
    private long sqlNanos;
    private long sqlMaxNanos;
    private int acquireCount;
    private int acquireFailures;
    private int queryCount;
    private int queryFailures;

    public RequestJdbcTiming(long startedNanos) {
        this.startedNanos = startedNanos;
    }

    public void acquired(
            String connectionId,
            long started,
            long finished,
            boolean success
    ) {
        long elapsed = finished - started;
        acquireCount++;
        acquireNanos += elapsed;
        acquireMaxNanos = Math.max(
                acquireMaxNanos,
                elapsed
        );
        if (!success) {
            acquireFailures++;
            return;
        }
        borrowedAt.put(
                connectionId,
                finished
        );
        acquisitionMs.put(
                connectionId,
                millis(elapsed)
        );
    }

    public void returned(
            String connectionId,
            long finished,
            boolean success
    ) {
        Long started = borrowedAt.get(connectionId);
        if (started == null || !success) {
            return;
        }
        borrowedAt.remove(connectionId);
        double acquiredMs = acquisitionMs.remove(connectionId);
        long elapsed = finished - started;
        usageNanos += elapsed;
        usageMaxNanos = Math.max(
                usageMaxNanos,
                elapsed
        );
        if (connections.size() < SAMPLE_LIMIT) {
            connections.add(
                    new JdbcConnectionTiming(
                            connectionId,
                            acquiredMs,
                            millis(elapsed),
                            true
                    )
            );
        }
    }

    public void executed(
            String connectionId,
            String sqlHash,
            long elapsed,
            boolean success
    ) {
        queryCount++;
        sqlNanos += elapsed;
        sqlMaxNanos = Math.max(
                sqlMaxNanos,
                elapsed
        );
        if (!success) {
            queryFailures++;
        }
        if (queries.size() < SAMPLE_LIMIT) {
            queries.add(
                    new JdbcQueryTiming(
                            queryCount,
                            connectionId,
                            sqlHash,
                            millis(elapsed),
                            success
                    )
            );
        }
    }

    public double elapsedMs(long now) {
        return millis(now - startedNanos);
    }

    public double acquireMs() {
        return millis(acquireNanos);
    }

    public double acquireMaxMs() {
        return millis(acquireMaxNanos);
    }

    public double usageMs() {
        return millis(usageNanos);
    }

    public double usageMaxMs() {
        return millis(usageMaxNanos);
    }

    public double sqlMs() {
        return millis(sqlNanos);
    }

    public double sqlMaxMs() {
        return millis(sqlMaxNanos);
    }

    public int acquireCount() {
        return acquireCount;
    }

    public int acquireFailures() {
        return acquireFailures;
    }

    public int queryCount() {
        return queryCount;
    }

    public int queryFailures() {
        return queryFailures;
    }

    public int openConnections() {
        return borrowedAt.size();
    }

    public List<JdbcConnectionTiming> connections() {
        return List.copyOf(connections);
    }

    public List<JdbcQueryTiming> queries() {
        return List.copyOf(queries);
    }

    private double millis(long nanos) {
        return nanos / 1_000_000.0;
    }
}
