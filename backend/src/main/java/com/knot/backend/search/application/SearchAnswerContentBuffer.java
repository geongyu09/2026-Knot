package com.knot.backend.search.application;

import com.knot.backend.search.domain.SearchErrorCode;
import com.knot.backend.search.domain.SearchException;
import java.util.function.Consumer;
import java.util.function.LongSupplier;

final class SearchAnswerContentBuffer implements Consumer<String>, AutoCloseable {
    private static final int FLUSH_CHARACTERS = 1024;
    private static final long FLUSH_INTERVAL_NANOS = 50_000_000L;

    private final Consumer<String> sink;
    private final LongSupplier nanoTime;
    private final StringBuilder content = new StringBuilder();
    private long lastFlushedAt;

    SearchAnswerContentBuffer(Consumer<String> sink) {
        this(
                sink,
                System::nanoTime
        );
    }

    SearchAnswerContentBuffer(
            Consumer<String> sink,
            LongSupplier nanoTime
    ) {
        this.sink = sink;
        this.nanoTime = nanoTime;
        this.lastFlushedAt = nanoTime.getAsLong() - FLUSH_INTERVAL_NANOS;
    }

    @Override
    public void accept(String text) {
        if (text == null) {
            throw new SearchException(SearchErrorCode.INVALID_SEARCH_STATE);
        }
        content.append(text);
        if (shouldFlush()) {
            flush();
        }
    }

    @Override
    public void close() {
        flush();
    }

    private boolean shouldFlush() {
        return content.length() >= FLUSH_CHARACTERS || nanoTime.getAsLong() - lastFlushedAt >= FLUSH_INTERVAL_NANOS;
    }

    private void flush() {
        if (content.isEmpty()) {
            return;
        }
        sink.accept(content.toString());
        content.setLength(0);
        lastFlushedAt = nanoTime.getAsLong();
    }
}
