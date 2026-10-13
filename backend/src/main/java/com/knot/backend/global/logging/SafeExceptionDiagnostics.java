package com.knot.backend.global.logging;

import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;

public final class SafeExceptionDiagnostics {
    private static final int MAX_NODES = 16;
    private static final int MAX_FRAMES = 4;
    private static final int MAX_LENGTH = 4096;
    private static final String OMITTED = " [omitted]";

    private final StringBuilder output = new StringBuilder();
    private final Set<Throwable> visited = Collections.newSetFromMap(new IdentityHashMap<>());

    private SafeExceptionDiagnostics() {}

    public static String describe(Throwable exception) {
        if (exception == null) {
            return "unknown";
        }
        SafeExceptionDiagnostics diagnostic = new SafeExceptionDiagnostics();
        diagnostic.append(
                exception,
                "root"
        );
        return diagnostic.result();
    }

    private void append(
            Throwable exception,
            String relation
    ) {
        if (exception == null) {
            return;
        }
        if (output.length() >= MAX_LENGTH || visited.size() >= MAX_NODES) {
            output.append(OMITTED);
            return;
        }
        if (!visited.add(exception)) {
            output.append(" [cycle]");
            return;
        }
        Class<? extends Throwable> type = exception.getClass();
        output.append(" ")
                .append(relation)
                .append("=")
                .append(type.getName());
        appendFrames(exception.getStackTrace());
        append(
                exception.getCause(),
                "cause"
        );
        for (Throwable suppressed : exception.getSuppressed()) {
            append(
                    suppressed,
                    "suppressed"
            );
            if (output.length() >= MAX_LENGTH || visited.size() >= MAX_NODES) {
                output.append(OMITTED);
                break;
            }
        }
    }

    private void appendFrames(StackTraceElement[] frames) {
        int count = Math.min(
                frames.length,
                MAX_FRAMES
        );
        for (int index = 0; index < count; index++) {
            output.append(" at ")
                    .append(frames[index]);
            if (output.length() >= MAX_LENGTH) {
                return;
            }
        }
        if (frames.length > count) {
            output.append(OMITTED);
        }
    }

    private String result() {
        if (output.length() > MAX_LENGTH) {
            return output.substring(
                    0,
                    MAX_LENGTH - OMITTED.length()
            ) + OMITTED;
        }
        return output.toString()
                .stripLeading();
    }
}
