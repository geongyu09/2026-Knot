package com.knot.backend.document.infrastructure.persistence;

import com.knot.backend.document.domain.model.DocumentConfirmation;
import com.knot.backend.document.domain.model.DocumentConfirmationId;
import org.springframework.data.jpa.repository.JpaRepository;

interface DocumentConfirmationJpaRepository extends JpaRepository<DocumentConfirmation, DocumentConfirmationId> {

}
