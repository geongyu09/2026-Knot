package com.knot.backend.search.application.dto.result;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.knot.backend.search.domain.SearchException;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SearchRetrievalResultTest {

    @Test
    @DisplayName("직접 답변은 문서 근거 없이 전달된다")
    void create_success_directAnswerWithoutDocuments() {
        SearchRetrievalResult result = new SearchRetrievalResult(
                List.of(),
                0,
                "반갑습니다"
        );

        assertThat(result.directAnswer()).isEqualTo("반갑습니다");
        assertThat(result.documents()).isEmpty();
    }

    @Test
    @DisplayName("기존 문서 검색 결과는 직접 답변 없이 전달된다")
    void create_success_documentRetrieval() {
        SearchDocumentResult document = new SearchDocumentResult(
                1,
                "회의",
                "결정",
                "본문"
        );

        SearchRetrievalResult result = new SearchRetrievalResult(
                List.of(document),
                1
        );

        assertThat(result.directAnswer()).isNull();
        assertThat(result.documents()).containsExactly(document);
    }

    @Test
    @DisplayName("비어 있는 직접 답변은 생성할 수 없다")
    void create_failure_blankDirectAnswer() {
        assertThatThrownBy(
                () -> new SearchRetrievalResult(
                        List.of(),
                        0,
                        " "
                )
        ).isInstanceOf(SearchException.class);
    }

    @Test
    @DisplayName("직접 답변에 문서 근거를 혼합할 수 없다")
    void create_failure_directAnswerWithDocuments() {
        SearchDocumentResult document = new SearchDocumentResult(
                1,
                "회의",
                "결정",
                "본문"
        );

        assertThatThrownBy(
                () -> new SearchRetrievalResult(
                        List.of(document),
                        0,
                        "반갑습니다"
                )
        ).isInstanceOf(SearchException.class);
    }

    @Test
    @DisplayName("직접 답변에 제외 문서 수를 설정할 수 없다")
    void create_failure_directAnswerWithExcludedDocuments() {
        assertThatThrownBy(
                () -> new SearchRetrievalResult(
                        List.of(),
                        1,
                        "반갑습니다"
                )
        ).isInstanceOf(SearchException.class);
    }
}
