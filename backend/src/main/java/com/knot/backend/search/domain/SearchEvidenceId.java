package com.knot.backend.search.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serializable;
import lombok.EqualsAndHashCode;
import lombok.Getter;

@Getter
@EqualsAndHashCode
@Embeddable
public class SearchEvidenceId implements Serializable {
    @Column(name = "message_id", nullable = false)
    private long messageId;
    @Column(name = "document_id", nullable = false)
    private long documentId;

    protected SearchEvidenceId() {}

    public static SearchEvidenceId of(
            long messageId,
            long documentId
    ) {
        if (messageId <= 0 || documentId <= 0) {
            throw new SearchException(SearchErrorCode.INVALID_SEARCH_STATE);
        }
        SearchEvidenceId id = new SearchEvidenceId();
        id.messageId = messageId;
        id.documentId = documentId;
        return id;
    }
}
