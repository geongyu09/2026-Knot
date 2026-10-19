package com.knot.backend.global.logging;

public record JdbcOperationTiming(
        String operation,
        String connectionId,
        double startedOffsetMs,
        double elapsedMs,
        boolean success,
        Double afterLastResultCloseMs
) {
}
