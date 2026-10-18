package com.knot.backend.global.logging;

public record JdbcQueryTiming(
        int sequence,
        String connectionId,
        String sqlHash,
        double elapsedMs,
        boolean success
) {
}
