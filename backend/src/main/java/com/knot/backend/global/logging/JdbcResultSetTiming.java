package com.knot.backend.global.logging;

public record JdbcResultSetTiming(
        int sqlSequence,
        String connectionId,
        double startedOffsetMs,
        double spanMs,
        double jdbcMs,
        long rows,
        int failures,
        boolean closed
) {
}
