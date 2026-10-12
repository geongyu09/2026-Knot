package com.knot.backend.search.infrastructure;

import com.knot.backend.search.domain.SearchMessage;
import org.springframework.data.jpa.repository.JpaRepository;

interface SearchMessageWriteJpaRepository extends JpaRepository<SearchMessage, Long> {}
