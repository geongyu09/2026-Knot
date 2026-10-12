package com.knot.backend.search.presentation.stream;

import com.knot.backend.search.domain.SearchErrorCode;
import com.knot.backend.search.domain.SearchException;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.Semaphore;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;

public final class SearchStreamReservation implements AutoCloseable, Runnable {

    private final Semaphore capacity;
    private final AtomicBoolean active = new AtomicBoolean(true);
    private final AtomicBoolean released = new AtomicBoolean();
    private final CountDownLatch stopped = new CountDownLatch(1);
    private final CompletableFuture<Runnable> connection = new CompletableFuture<>();

    SearchStreamReservation(Semaphore capacity) {
        this.capacity = capacity;
    }

    public boolean isActive() {
        return active.get();
    }

    void attach(Runnable ready) {
        if (!active.get() || !connection.complete(ready)) {
            throw new SearchException(SearchErrorCode.INVALID_SEARCH_STATE);
        }
    }

    @Override
    public void run() {
        try {
            Runnable ready = connection.get();
            ready.run();
        } catch (InterruptedException exception) {
            Thread.currentThread()
                    .interrupt();
        } catch (CancellationException ignored) {
        } catch (ExecutionException exception) {
            throw new SearchException(SearchErrorCode.INVALID_SEARCH_STATE);
        } finally {
            close();
            releasePermit();
        }
    }

    @Override
    public void close() {
        if (active.compareAndSet(
                true,
                false
        )) {
            connection.cancel(false);
            stopped.countDown();
        }
    }
    void awaitPoll(Duration interval) throws InterruptedException {
        stopped.await(
                interval.toNanos(),
                TimeUnit.NANOSECONDS
        );
    }

    void reject() {
        close();
        releasePermit();
    }

    private void releasePermit() {
        if (released.compareAndSet(
                false,
                true
        )) {
            capacity.release();
        }
    }
}
