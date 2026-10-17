package com.knot.backend.document.infrastructure.persistence;

record DocumentCardCountsRow(
        long documentId,
        long confirmedCount,
        long pendingCount,
        long excludedCount
) {
}
