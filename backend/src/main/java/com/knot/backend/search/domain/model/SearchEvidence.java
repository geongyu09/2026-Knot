package com.knot.backend.search.domain.model;

import com.knot.backend.search.domain.SearchErrorCode;
import com.knot.backend.search.domain.SearchException;

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
    private int rank;

    protected SearchEvidence() {}

    public static SearchEvidence create(
            long messageId,
            long documentId,
            int rank
    ) {
        if (rank < 1) {
            throw new SearchException(SearchErrorCode.INVALID_SEARCH_STATE);
        }
        SearchEvidence evidence = new SearchEvidence();
        evidence.id = SearchEvidenceId.of(
                messageId,
                documentId
        );
        evidence.rank = rank;
        return evidence;
    }
}
