package com.knot.backend.search.infrastructure;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import org.springframework.core.io.ClassPathResource;

public class SearchAnswerPrompt {
    private static final String SYSTEM = load();

    private SearchAnswerPrompt() {}

    public static String system() {
        return SYSTEM;
    }

    private static String load() {
        try {
            return new ClassPathResource("prompts/search-answer-system.md").getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new UncheckedIOException(
                    "탐색 시스템 프롬프트를 읽을 수 없습니다",
                    exception
            );
        }
    }
}
