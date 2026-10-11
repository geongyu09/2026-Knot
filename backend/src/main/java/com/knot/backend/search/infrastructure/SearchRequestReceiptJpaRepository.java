package com.knot.backend.search.infrastructure;

import com.knot.backend.search.domain.SearchRequestReceipt;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface SearchRequestReceiptJpaRepository extends JpaRepository<SearchRequestReceipt, Long> {

    @Query("""
            select r from SearchRequestReceipt r where r.workspaceId = :workspaceId and r.memberId = :memberId
                and r.operation = 'FIRST_QUESTION' and r.targetId = 0 and r.requestId = :requestId
            """)
    Optional<SearchRequestReceipt> findFirstReceipt(
            long workspaceId,
            long memberId,
            UUID requestId
    );
}
