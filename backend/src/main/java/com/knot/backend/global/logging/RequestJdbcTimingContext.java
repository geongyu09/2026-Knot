package com.knot.backend.global.logging;

public final class RequestJdbcTimingContext implements AutoCloseable {
    private static final ThreadLocal<RequestJdbcTiming> CURRENT = new ThreadLocal<>();

    private final RequestJdbcTiming previous;

    private RequestJdbcTimingContext(RequestJdbcTiming timing) {
        previous = CURRENT.get();
        CURRENT.set(timing);
    }

    public static RequestJdbcTimingContext open(RequestJdbcTiming timing) {
        return new RequestJdbcTimingContext(timing);
    }

    public static RequestJdbcTiming current() {
        return CURRENT.get();
    }

    @Override
    public void close() {
        if (previous == null) {
            CURRENT.remove();
            return;
        }
        CURRENT.set(previous);
    }
}
