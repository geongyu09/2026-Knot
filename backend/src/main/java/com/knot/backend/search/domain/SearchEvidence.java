package com.knot.backend.search.domain;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;

@Getter
@Entity
@Table(name = "search_evidences")
public class SearchEvidence {

    @EmbeddedId
    private SearchEvidenceId id;

    @Column(nullable = false)
    private short rank;

    protected SearchEvidence() {}

    public static SearchEvidence create(
            long messageId,
            long documentId,
            int rank
    ) {
        if (rank < 1 || rank > 3) {
            throw new SearchException(SearchErrorCode.INVALID_SEARCH_STATE);
        }
        SearchEvidence evidence = new SearchEvidence();
        evidence.id = SearchEvidenceId.of(
                messageId,
                documentId
        );
        evidence.rank = (short) rank;
        return evidence;
    }
}
