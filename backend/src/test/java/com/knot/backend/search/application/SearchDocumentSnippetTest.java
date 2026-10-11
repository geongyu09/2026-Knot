package com.knot.backend.search.application;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SearchDocumentSnippetTest {

    @Test
    @DisplayName("긴 본문의 검색어 주변 구간을 이모지를 보존해 반환한다")
    void extract_success_matchingWindow() {
        String content = "😀".repeat(250) + "알림 dedup 결정 담당 민지" + "회의".repeat(200);
        String snippet = SearchDocumentSnippet.extract(content, "DEDUP 민지");
        assertThat(snippet).contains("dedup 결정 담당 민지");
        assertThat(snippet.codePointCount(0, snippet.length())).isEqualTo(200);
        assertThat(snippet).startsWith("😀");
    }

    @Test
    @DisplayName("본문에 검색어가 없으면 앞부분을 반환하고 정규식 기호는 문자로 검색한다")
    void extract_success_literalQueryAndFallback() {
        assertThat(SearchDocumentSnippet.extract("짧은 본문", "없음")).isEqualTo("짧은 본문");
        String content = "앞".repeat(250) + "a+b 결정";
        assertThat(SearchDocumentSnippet.extract(content, "a+b")).endsWith("a+b 결정");
        assertThat(SearchDocumentSnippet.extract(content, null)).isEqualTo("앞".repeat(200));
    }
}
