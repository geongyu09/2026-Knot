package com.knot.backend.recording.domain.repository;

import com.knot.backend.recording.domain.model.RecordingTranscriptionInput;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface RecordingTranscriptionInputRepository {
    RecordingTranscriptionInput save(RecordingTranscriptionInput input);
    Optional<RecordingTranscriptionInput> findByRecordingId(long recordingId);
    Optional<RecordingTranscriptionInput> findByRecordingIdForUpdate(long recordingId);
    List<Long> findCandidates(
            Instant now,
            int limit
    );
    Optional<RecordingTranscriptionInput> findProcessing();
    void lockAdmission();
    void cancelByRecordingId(long recordingId);
}
