package com.knot.backend.global.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.knot.backend.document.application.DocumentDetailQuery;
import com.knot.backend.document.application.DocumentListQuery;
import com.knot.backend.document.application.dto.query.DocumentListParameters;
import com.knot.backend.document.application.dto.result.DocumentTopicResult;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class DocumentQueryTimingPostProcessorTest {

    @Test
    @DisplayName("목록 조회와 결과 DTO 매핑을 포함한 어댑터 호출을 기록하고 반환값을 보존한다")
    void postProcessor_success_preservesQueryResult() {
        // given
        AtomicLong clock = new AtomicLong();
        DocumentListQuery target = mock(DocumentListQuery.class);
        DocumentListParameters parameters = DocumentListParameters.of(
                null,
                100,
                null,
                null
        );
        List<DocumentTopicResult> result = List.of();
        when(
                target.findTopics(
                        12,
                        34,
                        parameters
                )
        ).thenAnswer(call -> {
            clock.addAndGet(23_000_000);
            return result;
        });
        DocumentListQuery proxy = DocumentListQuery.class.cast(
                new DocumentQueryTimingPostProcessor(clock::get).postProcessAfterInitialization(
                        target,
                        "list"
                )
        );
        RequestJdbcTiming timing = new RequestJdbcTiming(0);

        // when & then
        try (RequestJdbcTimingContext ignored = RequestJdbcTimingContext.open(timing)) {
            assertThat(
                    proxy.findTopics(
                            12,
                            34,
                            parameters
                    )
            ).isSameAs(result);
        }
        assertThat(
                timing.phases()
                        .operationMs()
        ).containsEntry(
                "query_list_findTopics",
                23.0
        );
    }

    @Test
    @DisplayName("상세 조회 실패는 예외와 인자를 노출하지 않고 원래 예외를 전달한다")
    void postProcessor_failure_preservesQueryException() {
        // given
        DocumentDetailQuery target = mock(DocumentDetailQuery.class);
        IllegalStateException failure = new IllegalStateException("private document");
        when(
                target.find(
                        12,
                        34,
                        56
                )
        ).thenThrow(failure);
        DocumentDetailQuery proxy = DocumentDetailQuery.class.cast(
                new DocumentQueryTimingPostProcessor(System::nanoTime).postProcessAfterInitialization(
                        target,
                        "detail"
                )
        );
        RequestJdbcTiming timing = new RequestJdbcTiming(System.nanoTime());

        // when & then
        try (RequestJdbcTimingContext ignored = RequestJdbcTimingContext.open(timing)) {
            assertThatThrownBy(
                    () -> proxy.find(
                            12,
                            34,
                            56
                    )
            ).isSameAs(failure);
        }
        assertThat(
                timing.phases()
                        .failures()
        ).isEqualTo(1);
        assertThat(
                timing.phases()
                        .operations()
                        .getFirst()
                        .operation()
        ).isEqualTo("query_detail_find");
        assertThat(
                timing.phases()
                        .operations()
                        .toString()
        ).doesNotContain("private document");
    }
}
