package com.knot.backend.recording.infrastructure;

import com.knot.backend.recording.domain.Transcript;
import org.springframework.data.jpa.repository.JpaRepository;

interface TranscriptJpaRepository extends JpaRepository<Transcript, Long> {}
