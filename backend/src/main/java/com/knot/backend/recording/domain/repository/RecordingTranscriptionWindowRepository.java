package com.knot.backend.recording.domain.repository;

import com.knot.backend.recording.domain.model.RecordingTranscriptionWindow;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface RecordingTranscriptionWindowRepository {
    RecordingTranscriptionWindow save(RecordingTranscriptionWindow window);
    List<RecordingTranscriptionWindow> findByRecordingIdAndPipelineVersionOrderByWindowIndex(
            long recordingId,
            String pipelineVersion
    );
    Optional<RecordingTranscriptionWindow> findByIdForUpdate(long id);
    Optional<RecordingTranscriptionWindow> findByRecordingIdAndPipelineVersionAndWindowIndex(
            long recordingId,
            String pipelineVersion,
            int windowIndex
    );
    List<Long> findReadyIds(
            Instant now,
            int limit
    );
    List<Long> findExpiredIds(
            Instant now,
            int limit
    );
    void cancelAllByRecordingId(long recordingId);
}
