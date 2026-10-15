package com.knot.backend.testsupport;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

final class SnapshotLogAppender extends ListAppender<ILoggingEvent> {

    @Override
    protected void append(ILoggingEvent event) {
        // MDC는 요청 스레드가 정리되기 전에 저장해야 비동기 로그를 검증할 수 있다.
        event.prepareForDeferredProcessing();
        super.append(event);
    }
}
