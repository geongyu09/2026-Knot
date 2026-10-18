package com.knot.backend.recording.infrastructure.persistence;

import com.knot.backend.recording.domain.model.TranscriptSegment;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

interface TranscriptSegmentJpaRepository extends JpaRepository<TranscriptSegment, Long> {

    List<TranscriptSegment> findAllByTranscriptIdOrderByStartMillisAscPositionAsc(long transcriptId);
}
