package com.knot.backend.search.infrastructure;

import java.util.concurrent.Semaphore;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;

public final class SearchStreamReservation implements AutoCloseable, Runnable {

    private final Semaphore capacity;
    private final AtomicBoolean active = new AtomicBoolean(true);
    private final CompletableFuture<Runnable> connection = new CompletableFuture<>();

    SearchStreamReservation(Semaphore capacity) {
        this.capacity = capacity;
    }

    public boolean isActive() {
        return active.get();
    }

    void attach(Runnable ready) {
        if (!active.get() || !connection.complete(ready)) {
            throw new IllegalStateException("stream reservation ended");
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
            throw new IllegalStateException(
                    "stream reservation failed",
                    exception
            );
        } finally {
            close();
        }
    }

    @Override
    public void close() {
        if (active.compareAndSet(
                true,
                false
        )) {
            connection.cancel(false);
            capacity.release();
        }
    }
}
