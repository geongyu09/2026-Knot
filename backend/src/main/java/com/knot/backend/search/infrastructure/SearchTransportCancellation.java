package com.knot.backend.search.infrastructure;

import com.knot.backend.search.domain.SearchException;
import com.knot.backend.global.logging.ServerErrorLogger;
import com.knot.backend.search.domain.SearchErrorCode;
import com.knot.backend.search.application.SearchToolAccess;
import com.knot.backend.search.application.SearchToolScope;
import java.io.InputStream;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

@lombok.extern.slf4j.Slf4j
public final class SearchTransportCancellation implements AutoCloseable {

    private final SearchToolAccess access;
    private final long intervalMillis;
    private final ScheduledThreadPoolExecutor monitors;
    private final Set<SearchTransportRegistration> registrations = ConcurrentHashMap.newKeySet();

    public SearchTransportCancellation(
            SearchToolAccess access,
            Duration interval
    ) {
        if (interval == null || interval.toMillis() < 1) {
            throw new SearchException(SearchErrorCode.INVALID_SEARCH_CONFIGURATION);
        }
        this.access = access;
        intervalMillis = interval.toMillis();
        monitors = new ScheduledThreadPoolExecutor(
                2,
                Thread.ofPlatform()
                        .daemon(true)
                        .factory()
        );
        monitors.setRemoveOnCancelPolicy(true);
    }

    public void validate(SearchToolScope scope) {
        access.validate(scope);
    }

    SearchTransportRegistration watch(
            SearchToolScope scope,
            CompletableFuture<HttpResponse<InputStream>> response
    ) {
        SearchTransportRegistration registration = new SearchTransportRegistration(
                response,
                registrations::remove
        );
        registrations.add(registration);
        try {
            registration.monitor(
                    monitors.scheduleWithFixedDelay(
                            () -> check(
                                    scope,
                                    registration
                            ),
                            0,
                            intervalMillis,
                            TimeUnit.MILLISECONDS
                    )
            );
            return registration;
        } catch (RuntimeException exception) {
            registration.close();
            throw exception;
        }
    }

    private void check(
            SearchToolScope scope,
            SearchTransportRegistration registration
    ) {
        try {
            access.validate(scope);
        } catch (RuntimeException exception) {
            ServerErrorLogger.record(
                    log,
                    "Search transport phase=access-monitor",
                    exception
            );
            registration.close();
        }
    }

    int activeCount() {
        return registrations.size();
    }

    @Override
    public void close() {
        monitors.shutdownNow();
        registrations.forEach(SearchTransportRegistration::close);
    }
}
