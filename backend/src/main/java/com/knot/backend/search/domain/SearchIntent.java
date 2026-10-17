package com.knot.backend.search.domain;

public enum SearchIntent {
    MEETING_SEARCH,
    GREETING_OR_THANKS,
    SERVICE_GUIDE,
    NEEDS_CLARIFICATION,
    OUT_OF_SCOPE;

    public boolean requiresSearch() {
        return this == MEETING_SEARCH;
    }
}
