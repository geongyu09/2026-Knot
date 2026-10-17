package com.knot.backend.search.application;

import com.knot.backend.search.domain.model.SearchIntent;

public interface SearchIntentClassifier {

    SearchIntent classify(
            SearchToolScope scope,
            String question
    );
}
