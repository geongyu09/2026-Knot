package com.knot.backend.search.application.dto.query;

import com.knot.backend.search.domain.SearchToolException;
import java.time.Instant;

public record SearchDocumentParameters(
        String query,
        String topic,
        Instant recordedFrom,
        Instant recordedBefore,
        String cursor,
        Integer size
) {

    public SearchDocumentParameters {
        size = resolveSize(size);
        validateSize(size);
        validateRange(
                recordedFrom,
                recordedBefore
        );
        validateText(
                query,
                200
        );
        validateText(
                topic,
                200
        );
        validateCursor(cursor);
    }

    public SearchDocumentParameters withoutCursor() {
        return new SearchDocumentParameters(
                query,
                topic,
                recordedFrom,
                recordedBefore,
                null,
                20
        );
    }

    private static int resolveSize(Integer size) {
        if (size == null) {
            return 20;
        }
        return size;
    }

    private static void validateSize(int size) {
        if (size < 1 || size > 100) {
            throw invalid();
        }
    }

    private static void validateRange(
            Instant from,
            Instant before
    ) {
        if (from != null && before != null && !from.isBefore(before)) {
            throw invalid();
        }
    }

    private static void validateText(
            String text,
            int limit
    ) {
        if (text == null) {
            return;
        }
        if (text.isBlank() || text.codePointCount(
                0,
                text.length()
        ) > limit) {
            throw invalid();
        }
    }

    private static void validateCursor(String cursor) {
        if (cursor == null) {
            return;
        }
        if (cursor.isBlank() || cursor.length() > 8192) {
            throw invalid();
        }
    }

    private static SearchToolException invalid() {
        return new SearchToolException("INVALID_TOOL_ARGUMENTS");
    }
}
