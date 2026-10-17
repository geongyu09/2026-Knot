package com.knot.backend.search.domain;

import com.knot.backend.search.domain.model.SearchAnswerExecution;
import com.knot.backend.search.domain.model.SearchEvidence;
import com.knot.backend.search.domain.model.SearchEvidenceId;
import com.knot.backend.search.domain.model.SearchMessage;
import com.knot.backend.search.domain.model.SearchRequestReceipt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import com.knot.backend.global.config.SearchWorkerProperties;
import com.knot.backend.global.exception.ErrorCode;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class SearchInvariantExceptionTest {
    private static final Instant NOW = Instant.parse("2026-10-12T00:00:00Z");

    @ParameterizedTest
    @MethodSource("invalidValues")
    @DisplayName("탐색의 잘못된 입력과 내부 데이터는 커스텀 오류 코드로 구분한다")
    void validate_failure_customException(
            Runnable action,
            String code
    ) {
        assertThatExceptionOfType(SearchException.class).isThrownBy(action::run)
                .satisfies(
                        exception -> assertThat(exception.getErrorCode()).extracting(ErrorCode::getCode)
                                .isEqualTo(code)
                );
    }

    private static Stream<Arguments> invalidValues() {
        return Stream.of(
                Arguments.of(
                        (Runnable) () -> SearchMessage.receiveQuestion(
                                1,
                                1,
                                " ",
                                NOW
                        ),
                        "VALIDATION_ERROR"
                ),
                Arguments.of(
                        (Runnable) () -> SearchMessage.startAnswer(
                                0,
                                2,
                                NOW
                        ),
                        "INVALID_SEARCH_STATE"
                ),
                Arguments.of(
                        (Runnable) () -> SearchMessage.startAnswer(
                                1,
                                2,
                                null
                        ),
                        "INVALID_SEARCH_STATE"
                ),
                Arguments.of(
                        (Runnable) () -> SearchEvidence.create(
                                1,
                                2,
                                0
                        ),
                        "INVALID_SEARCH_STATE"
                ),
                Arguments.of(
                        (Runnable) () -> SearchEvidenceId.of(
                                0,
                                2
                        ),
                        "INVALID_SEARCH_STATE"
                ),
                Arguments.of(
                        (Runnable) () -> SearchAnswerExecution.queue(
                                1,
                                2,
                                2,
                                NOW
                        ),
                        "INVALID_SEARCH_STATE"
                ),
                Arguments.of(
                        (Runnable) () -> SearchAnswerExecution.queue(
                                1,
                                2,
                                3,
                                null
                        ),
                        "INVALID_SEARCH_STATE"
                ),
                Arguments.of(
                        (Runnable) () -> SearchRequestReceipt.firstQuestion(
                                1,
                                2,
                                null,
                                3,
                                4,
                                5,
                                NOW
                        ),
                        "INVALID_SEARCH_STATE"
                ),
                Arguments.of(
                        (Runnable) () -> SearchAnswerExecution.queue(
                                1,
                                2,
                                3,
                                NOW
                        )
                                .claim(
                                        UUID.randomUUID(),
                                        NOW,
                                        Duration.ZERO
                                ),
                        "INVALID_SEARCH_STATE"
                ),
                Arguments.of(
                        (Runnable) SearchInvariantExceptionTest::invalidWorker,
                        "INVALID_SEARCH_CONFIGURATION"
                )
        );
    }

    private static void invalidWorker() {
        SearchWorkerProperties properties = new SearchWorkerProperties();
        properties.setConcurrency(0);
        properties.validate();
    }
}
