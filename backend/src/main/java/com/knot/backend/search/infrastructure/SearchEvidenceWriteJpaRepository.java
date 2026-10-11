package com.knot.backend.search.infrastructure;

import com.knot.backend.search.domain.SearchEvidence;
import com.knot.backend.search.domain.SearchEvidenceId;
import org.springframework.data.jpa.repository.JpaRepository;

interface SearchEvidenceWriteJpaRepository extends JpaRepository<SearchEvidence, SearchEvidenceId> {

    void deleteByIdMessageId(long messageId);
}
