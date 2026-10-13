package com.knot.backend.recording.domain;

import java.util.Optional;

public interface RecordingTranscriptionRepository {
    RecordingTranscription saveAndFlush(RecordingTranscription transcription);
    Optional<RecordingTranscription> findByRecordingSessionId(long recordingSessionId);
    Optional<RecordingTranscription> findByRecordingSessionIdForUpdate(long recordingSessionId);
    Optional<RecordingTranscription> findProcessing();
    void lockAdmission();
}
