package com.knot.backend.search.domain.model;

import com.knot.backend.search.domain.SearchErrorCode;
import com.knot.backend.search.domain.SearchException;

import java.util.regex.Pattern;

public final class SearchQuestionText {
    private static final int MAX_CODE_POINTS = 2000;
    private static final Pattern BLANK = Pattern.compile("[\\p{javaWhitespace}\\p{Z}]*");

    private SearchQuestionText() {}

    public static void validate(String content) {
        validateNotBlank(content);
        validateLength(content);
    }

    private static void validateNotBlank(String content) {
        if (content == null || BLANK.matcher(content)
                .matches()) {
            throw new SearchException(SearchErrorCode.VALIDATION_ERROR);
        }
    }

    private static void validateLength(String content) {
        if (content.codePointCount(
                0,
                content.length()
        ) > MAX_CODE_POINTS) {
            throw new SearchException(SearchErrorCode.VALIDATION_ERROR);
        }
    }
}
