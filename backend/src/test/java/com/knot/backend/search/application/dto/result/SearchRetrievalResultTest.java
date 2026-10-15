package com.knot.backend.search.application.dto.result;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.knot.backend.search.domain.SearchException;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SearchRetrievalResultTest {

    @Test
    @DisplayName("읽은 문서와 제외 수를 전달하고 원본 컬렉션 변경으로부터 보호한다")
    void create_success_documentRetrieval() {
        SearchDocumentResult document = new SearchDocumentResult(
                1,
                "회의",
                "결정",
                "본문"
        );
        List<SearchDocumentResult> documents = new ArrayList<>(List.of(document));
        SearchRetrievalResult result = new SearchRetrievalResult(
                documents,
                1
        );
        documents.clear();
        assertThat(result.documents()).containsExactly(document);
        assertThat(result.excludedCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("제외 수는 음수가 될 수 없다")
    void create_failure_negativeExcludedCount() {
        assertThatThrownBy(
                () -> new SearchRetrievalResult(
                        List.of(),
                        -1
                )
        ).isInstanceOf(SearchException.class);
    }
}
