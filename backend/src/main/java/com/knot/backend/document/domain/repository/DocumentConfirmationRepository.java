package com.knot.backend.document.domain.repository;

import com.knot.backend.document.domain.model.DocumentConfirmation;

import java.util.Optional;
import java.util.List;

public interface DocumentConfirmationRepository {

    void saveAll(List<DocumentConfirmation> confirmations);

    Optional<DocumentConfirmation> findByDocumentIdAndMemberId(
            long documentId,
            long memberId
    );

    void flush();
}
