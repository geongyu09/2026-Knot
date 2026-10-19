package com.knot.backend.search.application.dto.command;

import com.knot.backend.search.domain.SearchErrorCode;
import com.knot.backend.search.domain.SearchException;
import com.knot.backend.search.domain.model.SearchQuestionText;
import java.util.UUID;
import java.util.regex.Pattern;

public record SearchQuestionCommand(
        String content,
        UUID requestId
) {
    private static final Pattern UUID_PATTERN = Pattern
            .compile("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");

    public SearchQuestionCommand {
        SearchQuestionText.validate(content);
        if (requestId == null) {
            throw new SearchException(SearchErrorCode.VALIDATION_ERROR);
        }
    }

    public static SearchQuestionCommand of(
            String content,
            String requestId
    ) {
        return new SearchQuestionCommand(
                content,
                parseRequestId(requestId)
        );
    }

    public static UUID parseRequestId(String requestId) {
        if (requestId == null || !UUID_PATTERN.matcher(requestId)
                .matches()) {
            throw new SearchException(SearchErrorCode.VALIDATION_ERROR);
        }
        return UUID.fromString(requestId);
    }
}
