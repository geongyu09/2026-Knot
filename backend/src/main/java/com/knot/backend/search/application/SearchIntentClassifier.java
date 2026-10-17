package com.knot.backend.search.application;

import com.knot.backend.search.domain.SearchIntent;

public interface SearchIntentClassifier {

    SearchIntent classify(
            SearchToolScope scope,
            String question
    );
}
