package com.knot.backend.search.infrastructure;

import com.knot.backend.search.domain.SearchConversation;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

interface SearchConversationWriteJpaRepository extends JpaRepository<SearchConversation, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from SearchConversation c where c.id = :id")
    Optional<SearchConversation> findForUpdate(long id);
}
