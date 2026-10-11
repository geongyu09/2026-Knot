package com.knot.backend.search.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import com.knot.backend.global.config.SearchAgentProperties;
import com.knot.backend.search.application.SearchToolAccess;
import com.knot.backend.search.application.SearchToolScope;
import com.knot.backend.search.application.dto.result.SearchDocumentResult;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class SearchStreamingAnswerGeneratorTest {

    private final SearchLlmClient llm = mock(SearchLlmClient.class);
    private final SearchHistoryQuery history = mock(SearchHistoryQuery.class);
    private final SearchToolAccess access = mock(SearchToolAccess.class);
    private final JsonMapper mapper = JsonMapper.builder()
            .build();
    private SearchToolScope scope;
    private SearchStreamingAnswerGenerator generator;

    @BeforeEach
    void setUp() {
        Instant now = Instant.now();
        scope = new SearchToolScope(
                1,
                1,
                1,
                1,
                2,
                UUID.randomUUID(),
                now,
                now.plusSeconds(120)
        );
        when(history.beforeQuestion(scope)).thenReturn(List.of());
        generator = new SearchStreamingAnswerGenerator(
                llm,
                history,
                access,
                new SearchAgentProperties(),
                mapper
        );
        doAnswer(call -> {
            Consumer<String> consumer = call.getArgument(2);
            consumer.accept("네 회의의 변화 [4] [2] [1] [3]");
            return null;
        }).when(llm)
                .stream(
                        eq(scope),
                        any(),
                        any()
                );
    }

    @Test
    @DisplayName("실제 읽은 모든 근거를 질문 관련도 순서로 돌려주고 세 개로 자르지 않는다")
    void generate_success_allUsedEvidence() {
        when(
                llm.evidence(
                        eq(scope),
                        any()
                )
        ).thenReturn(
                mapper.valueToTree(
                        Map.of(
                                "content",
                                "{\"usedDocumentIds\":[4,2,1,3]}"
                        )
                )
        );
        List<String> deltas = new ArrayList<>();
        assertThat(
                generator.generate(
                        scope,
                        "변화",
                        documents(),
                        deltas::add
                )
        ).containsExactly(
                4L,
                2L,
                1L,
                3L
        );
        assertThat(deltas).hasSize(1);
    }

    @Test
    @DisplayName("읽지 않은 ID와 중복 ID는 실제 사용 근거로 인정하지 않는다")
    void generate_failure_unreadAndDuplicateEvidence() {
        when(
                llm.evidence(
                        eq(scope),
                        any()
                )
        ).thenReturn(
                mapper.valueToTree(
                        Map.of(
                                "content",
                                "{\"usedDocumentIds\":[99]}"
                        )
                ),
                mapper.valueToTree(
                        Map.of(
                                "content",
                                "{\"usedDocumentIds\":[1,1]}"
                        )
                )
        );
        assertThatThrownBy(
                () -> generator.generate(
                        scope,
                        "변화",
                        documents(),
                        text -> {
                        }
                )
        ).hasMessage("INVALID_MODEL_EVIDENCE");
        assertThatThrownBy(
                () -> generator.generate(
                        scope,
                        "변화",
                        documents(),
                        text -> {
                        }
                )
        ).hasMessage("INVALID_MODEL_EVIDENCE");
    }

    private List<SearchDocumentResult> documents() {
        return java.util.stream.LongStream.rangeClosed(
                1,
                4
        )
                .mapToObj(
                        id -> new SearchDocumentResult(
                                id,
                                "회의",
                                "결정",
                                "읽은 본문"
                        )
                )
                .toList();
    }
}
