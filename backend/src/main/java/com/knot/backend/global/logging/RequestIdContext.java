package com.knot.backend.global.logging;

import org.slf4j.MDC;

final class RequestIdContext implements AutoCloseable {
    static final String MDC_KEY = "requestId";

    private final String previous;

    private RequestIdContext(String requestId) {
        previous = MDC.get(MDC_KEY);
        set(requestId);
    }

    static RequestIdContext open(String requestId) {
        return new RequestIdContext(requestId);
    }

    @Override
    public void close() {
        set(previous);
    }

    private void set(String requestId) {
        if (requestId == null) {
            MDC.remove(MDC_KEY);
            return;
        }
        MDC.put(
                MDC_KEY,
                requestId
        );
    }
}
