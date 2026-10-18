package com.knot.backend.search.infrastructure.persistence;

import com.knot.backend.search.domain.model.SearchEvidence;
import com.knot.backend.search.domain.model.SearchEvidenceId;
import org.springframework.data.jpa.repository.JpaRepository;

interface SearchEvidenceWriteJpaRepository extends JpaRepository<SearchEvidence, SearchEvidenceId> {

    void deleteByIdMessageId(long messageId);
}
