package com.knot.backend.search.infrastructure.persistence;

import java.time.Instant;

public record SearchConversationListRow(
        long id,
        String firstQuestion,
        String lastMessage,
        Instant createdAt,
        Instant updatedAt
) {
}
