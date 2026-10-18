package com.knot.backend.global.logging;

public record JdbcConnectionTiming(
        String connectionId,
        double acquireMs,
        double usageMs,
        boolean returned
) {
}
