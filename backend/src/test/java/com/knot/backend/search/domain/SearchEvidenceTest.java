package com.knot.backend.search.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SearchEvidenceTest {

    @Test
    @DisplayName("표시 카드보다 많은 실제 근거의 순위를 보존한다")
    void create_success_rankBeyondCards() {
        SearchEvidence evidence = SearchEvidence.create(
                1,
                2,
                40000
        );
        assertThat(evidence.getRank()).isEqualTo(40000);
    }

    @Test
    @DisplayName("근거 순위는 양수여야 한다")
    void create_failure_nonPositiveRank() {
        assertThatExceptionOfType(SearchException.class).isThrownBy(
                () -> SearchEvidence.create(
                        1,
                        2,
                        0
                )
        )
                .satisfies(
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(SearchErrorCode.INVALID_SEARCH_STATE)
                );
    }
}
