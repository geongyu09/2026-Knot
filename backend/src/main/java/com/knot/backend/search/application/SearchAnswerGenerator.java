package com.knot.backend.search.application;

import com.knot.backend.search.application.dto.result.SearchDocumentResult;
import java.util.List;
import java.util.function.Consumer;

public interface SearchAnswerGenerator {
    List<Long> generate(
            String question,
            List<SearchDocumentResult> documents,
            Consumer<String> onDelta
    );
}
