package com.knot.backend.global.logging;

import org.slf4j.MDC;
import org.springframework.core.task.TaskDecorator;

public class RequestIdTaskDecorator implements TaskDecorator {

    @Override
    public Runnable decorate(Runnable runnable) {
        String requestId = MDC.get(RequestIdContext.MDC_KEY);
        return () -> {
            try (RequestIdContext ignored = RequestIdContext.open(requestId)) {
                runnable.run();
            }
        };
    }
}
