package com.knot.backend.document.infrastructure.persistence;

record DocumentTopicRow(
        String topic,
        long documentCount
) {
}
