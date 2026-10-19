package com.knot.backend.search.application;

import com.knot.backend.search.domain.model.SearchIntent;
import com.knot.backend.search.domain.SearchToolException;

public final class SearchIntentGuidance {

    private SearchIntentGuidance() {}

    public static String forIntent(SearchIntent intent) {
        return switch (intent) {
            case GREETING_OR_THANKS -> "안녕하세요. 회의 기록에서 궁금한 내용을 질문해 주세요.";
            case SERVICE_GUIDE -> "Knot 탐색에서는 모아 둔 회의 문서를 조회·요약·비교할 수 있어요. 찾고 싶은 내용을 질문해 주세요.";
            case NEEDS_CLARIFICATION -> "어떤 회의나 안건을 찾고 싶은지 조금 더 구체적으로 질문해 주세요.";
            case OUT_OF_SCOPE -> "Knot은 회의 기록의 조회·요약·비교를 도와드려요. 찾고 싶은 회의 내용을 질문해 주세요.";
            case MEETING_SEARCH -> throw new SearchToolException("INVALID_INTENT_GUIDANCE");
        };
    }
}
