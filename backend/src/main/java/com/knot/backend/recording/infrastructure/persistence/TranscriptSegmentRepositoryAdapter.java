package com.knot.backend.recording.infrastructure.persistence;

import com.knot.backend.recording.domain.model.TranscriptSegment;
import com.knot.backend.recording.domain.repository.TranscriptSegmentRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class TranscriptSegmentRepositoryAdapter implements TranscriptSegmentRepository {

    private final TranscriptSegmentJpaRepository segments;

    @Override
    public void saveAll(List<TranscriptSegment> transcriptSegments) {
        segments.saveAll(transcriptSegments);
    }

    @Override
    public List<TranscriptSegment> findAllByTranscriptId(long transcriptId) {
        return segments.findAllByTranscriptIdOrderByStartMillisAscPositionAsc(transcriptId);
    }
}
