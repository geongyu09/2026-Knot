package com.knot.backend.global.logging;

final class JdbcResultSetObservation {

    private final int sqlSequence;
    private final String connectionId;
    private final long requestStarted;
    private final long opened;
    private long jdbcNanos;
    private long rows;
    private int failures;

    JdbcResultSetObservation(
            int sqlSequence,
            String connectionId,
            long requestStarted,
            long opened
    ) {
        this.sqlSequence = sqlSequence;
        this.connectionId = connectionId;
        this.requestStarted = requestStarted;
        this.opened = opened;
    }

    void called(
            long elapsed,
            boolean row,
            boolean success
    ) {
        jdbcNanos += elapsed;
        if (row) {
            rows++;
        }
        if (!success) {
            failures++;
        }
    }

    JdbcResultSetTiming snapshot(
            long finished,
            boolean closed
    ) {
        return new JdbcResultSetTiming(
                sqlSequence,
                connectionId,
                (opened - requestStarted) / 1_000_000.0,
                (finished - opened) / 1_000_000.0,
                jdbcNanos / 1_000_000.0,
                rows,
                failures,
                closed
        );
    }
}
