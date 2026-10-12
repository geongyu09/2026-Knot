package com.knot.backend.search.application.dto.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import com.knot.backend.search.domain.SearchException;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class SearchQuestionCommandTest {
    private static final String REQUEST_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

    @Test
    @DisplayName("질문 원문을 보존하고 UUID를 변환한다")
    void of_success_preservesOriginal() {
        SearchQuestionCommand command = SearchQuestionCommand.of(
                "  질문 😀\n",
                REQUEST_ID
        );
        assertThat(command.content()).isEqualTo("  질문 😀\n");
        assertThat(command.requestId()).isEqualTo(UUID.fromString(REQUEST_ID));
    }

    @Test
    @DisplayName("이모지 2,000 코드 포인트는 허용하지만 2,001개는 거절한다")
    void of_success_codePointBoundary() {
        assertThat(
                SearchQuestionCommand.of(
                        "😀".repeat(2000),
                        REQUEST_ID
                )
                        .content()
        ).hasSize(4000);
        assertThatExceptionOfType(SearchException.class).isThrownBy(
                () -> SearchQuestionCommand.of(
                        "😀".repeat(2001),
                        REQUEST_ID
                )
        )
                .satisfies(
                        error -> assertThat(
                                error.getErrorCode()
                                        .getCode()
                        ).isEqualTo("VALIDATION_ERROR")
                );
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\n\t", "\u00a0", "\u3000"})
    @DisplayName("빈 질문과 Unicode 공백 질문은 접수 전에 거절한다")
    void of_failure_blankContent(String content) {
        assertThatExceptionOfType(SearchException.class).isThrownBy(
                () -> SearchQuestionCommand.of(
                        content,
                        REQUEST_ID
                )
        );
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"invalid", "1-1-1-1-1", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee ",
            "{aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee}"})
    @DisplayName("축약 UUID와 잘못된 requestId는 VALIDATION_ERROR다")
    void of_failure_invalidRequestId(String requestId) {
        assertThatExceptionOfType(SearchException.class).isThrownBy(
                () -> SearchQuestionCommand.of(
                        "질문",
                        requestId
                )
        )
                .satisfies(
                        error -> assertThat(
                                error.getErrorCode()
                                        .getCode()
                        ).isEqualTo("VALIDATION_ERROR")
                );
    }
}
