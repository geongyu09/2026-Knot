package com.knot.backend.recording.infrastructure;

import com.knot.backend.recording.domain.TranscriptSegment;
import com.knot.backend.recording.domain.TranscriptSegmentRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class TranscriptSegmentRepositoryAdapter implements TranscriptSegmentRepository {
    private final TranscriptSegmentJpaRepository transcriptSegmentJpaRepository;

    @Override
    public void saveAll(List<TranscriptSegment> transcriptSegments) {
        transcriptSegmentJpaRepository.saveAll(transcriptSegments);
    }

    @Override
    public List<TranscriptSegment> findAllByTranscriptId(long transcriptId) {
        return transcriptSegmentJpaRepository.findAllByTranscriptIdOrderByStartMillisAscPositionAsc(transcriptId);
    }
}
