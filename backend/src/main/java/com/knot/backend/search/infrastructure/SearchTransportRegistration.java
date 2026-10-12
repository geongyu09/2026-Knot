package com.knot.backend.search.infrastructure;

import java.io.IOException;
import java.io.InputStream;
import java.net.http.HttpResponse;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ScheduledFuture;
import java.util.function.Consumer;

final class SearchTransportRegistration implements AutoCloseable {

    private final CompletableFuture<HttpResponse<InputStream>> response;
    private final Consumer<SearchTransportRegistration> onClose;
    private InputStream input;
    private ScheduledFuture<?> monitor;
    private boolean closed;

    SearchTransportRegistration(
            CompletableFuture<HttpResponse<InputStream>> response,
            Consumer<SearchTransportRegistration> onClose
    ) {
        this.response = response;
        this.onClose = onClose;
        response.whenComplete(
                (
                        received,
                        failure
                ) -> {
                    if (received != null) {
                        attach(received.body());
                    }
                }
        );
    }

    synchronized void attach(InputStream body) {
        if (closed) {
            closeInput(body);
            return;
        }
        input = body;
    }

    synchronized void monitor(ScheduledFuture<?> task) {
        if (closed) {
            task.cancel(false);
            return;
        }
        monitor = task;
    }

    @Override
    public synchronized void close() {
        if (closed) {
            return;
        }
        closed = true;
        if (monitor != null) {
            monitor.cancel(false);
        }
        response.cancel(true);
        if (input != null) {
            closeInput(input);
        }
        onClose.accept(this);
    }

    private void closeInput(InputStream body) {
        try {
            body.close();
        } catch (IOException exception) {
            // 취소 후 본문 닫기 오류로 확정된 DB 종료 상태를 변경하지 않는다.
        }
    }
}
