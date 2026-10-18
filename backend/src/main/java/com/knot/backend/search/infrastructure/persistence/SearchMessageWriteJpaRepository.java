package com.knot.backend.search.infrastructure.persistence;

import com.knot.backend.search.domain.model.SearchMessage;
import com.knot.backend.search.domain.model.SearchMessageRole;
import com.knot.backend.search.domain.model.SearchMessageStatus;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

interface SearchMessageWriteJpaRepository extends JpaRepository<SearchMessage, Long> {

    Optional<SearchMessage> findByConversationIdAndSequence(
            long conversationId,
            int sequence
    );

    boolean existsByConversationIdAndRoleAndStatus(
            long conversationId,
            SearchMessageRole role,
            SearchMessageStatus status
    );

    Optional<SearchMessage> findFirstByConversationIdOrderBySequenceDesc(long conversationId);
}
