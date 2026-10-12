package com.knot.backend.search.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.knot.backend.search.domain.SearchErrorCode;
import com.knot.backend.search.domain.SearchException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SearchAnswerContentBufferTest {

    @Test
    @DisplayName("첫 조각은 바로 저장하고 이어지는 짧은 조각은 하나의 본문 batch로 보존한다")
    void accept_success_batchesSmallDeltas() {
        List<String> saved = new ArrayList<>();
        try (SearchAnswerContentBuffer buffer = new SearchAnswerContentBuffer(
                saved::add,
                () -> 0L
        )) {
            for (int index = 0; index < 1000; index++) {
                buffer.accept("가");
            }
        }
        assertThat(saved).hasSize(2);
        assertThat(
                String.join(
                        "",
                        saved
                )
        ).isEqualTo("가".repeat(1000));
    }

    @Test
    @DisplayName("새 조각이 들어올 때 저장 간격 50ms에 도달하면 batch를 저장한다")
    void accept_success_atIntervalBoundary() {
        AtomicLong time = new AtomicLong();
        List<String> saved = new ArrayList<>();
        try (SearchAnswerContentBuffer buffer = new SearchAnswerContentBuffer(
                saved::add,
                time::get
        )) {
            buffer.accept("첫 ");
            buffer.accept("부분 ");
            time.set(50_000_000L);
            buffer.accept("답변");
            assertThat(saved).containsExactly(
                    "첫 ",
                    "부분 답변"
            );
        }
    }

    @Test
    @DisplayName("buffer 길이 1024에 도달하면 시각과 관계없이 저장한다")
    void accept_success_atLengthBoundary() {
        List<String> saved = new ArrayList<>();
        try (SearchAnswerContentBuffer buffer = new SearchAnswerContentBuffer(
                saved::add,
                () -> 0L
        )) {
            buffer.accept("첫");
            buffer.accept("나".repeat(1023));
            assertThat(saved).hasSize(1);
            buffer.accept("😀");
            assertThat(saved).containsExactly(
                    "첫",
                    "나".repeat(1023) + "😀"
            );
        }
    }

    @Test
    @DisplayName("생성 중 예외가 발생해도 종료 시 아직 저장하지 않은 부분 본문을 보존한다")
    void close_success_preservesPartialOnFailure() {
        List<String> saved = new ArrayList<>();
        try (SearchAnswerContentBuffer buffer = new SearchAnswerContentBuffer(
                saved::add,
                () -> 0L
        )) {
            buffer.accept("첫 ");
            buffer.accept("부분 😀");
            throw new SearchException(SearchErrorCode.INVALID_SEARCH_STATE);
        } catch (SearchException ignored) {
        }
        assertThat(saved).containsExactly(
                "첫 ",
                "부분 😀"
        );
    }
}
