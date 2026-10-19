package com.knot.backend.recording.domain.repository;

import com.knot.backend.recording.domain.model.TranscriptSegment;

import java.util.List;

public interface TranscriptSegmentRepository {

    void saveAll(List<TranscriptSegment> segments);

    List<TranscriptSegment> findAllByTranscriptId(long transcriptId);
}
