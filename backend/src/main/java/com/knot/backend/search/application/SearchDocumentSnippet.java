package com.knot.backend.search.application;

import java.util.Arrays;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

final class SearchDocumentSnippet {
    private static final int LIMIT = 200;
    private static final int BEFORE = 80;

    private SearchDocumentSnippet() {}

    static String extract(
            String content,
            String query
    ) {
        int match = matchOffset(
                content,
                query
        );
        int start = Math.max(
                0,
                match - BEFORE
        );
        int length = content.codePointCount(
                0,
                content.length()
        );
        int end = Math.min(
                length,
                start + LIMIT
        );
        return content.substring(
                content.offsetByCodePoints(
                        0,
                        start
                ),
                content.offsetByCodePoints(
                        0,
                        end
                )
        );
    }

    private static int matchOffset(
            String content,
            String query
    ) {
        if (query == null || query.isBlank()) {
            return 0;
        }
        String expression = Arrays.stream(
                query.strip()
                        .split("\\s+")
        )
                .limit(8)
                .map(Pattern::quote)
                .collect(Collectors.joining("|"));
        Matcher matcher = Pattern.compile(
                expression,
                Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
        )
                .matcher(content);
        if (!matcher.find()) {
            return 0;
        }
        return content.codePointCount(
                0,
                matcher.start()
        );
    }
}
