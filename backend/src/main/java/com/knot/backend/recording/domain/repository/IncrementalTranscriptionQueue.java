package com.knot.backend.recording.domain.repository;

import java.time.Instant;
import java.util.List;

public interface IncrementalTranscriptionQueue {
    List<Long> findRecordings(
            long afterId,
            int limit
    );
    List<WindowTask> findCandidates(
            Instant now,
            int limit
    );
    boolean hasProcessingWindow();
    record WindowTask(
            long recordingId,
            long windowId
    ) {
    }
}
