package com.knot.backend.recording.infrastructure;

import com.knot.backend.recording.domain.RecordingTranscription;
import com.knot.backend.recording.domain.RecordingTranscriptionRepository;
import com.knot.backend.recording.domain.TranscriptionStatus;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class RecordingTranscriptionRepositoryAdapter implements RecordingTranscriptionRepository {
    private final RecordingTranscriptionJpaRepository transcriptions;

    @Override
    public RecordingTranscription saveAndFlush(RecordingTranscription transcription) {
        return transcriptions.saveAndFlush(transcription);
    }

    @Override
    public Optional<RecordingTranscription> findByRecordingSessionId(long recordingSessionId) {
        return transcriptions.findByRecordingSessionId(recordingSessionId);
    }

    @Override
    public Optional<RecordingTranscription> findByRecordingSessionIdForUpdate(long recordingSessionId) {
        return transcriptions.findWithLockByRecordingSessionId(recordingSessionId);
    }

    @Override
    public Optional<RecordingTranscription> findProcessing() {
        return transcriptions.findByStatus(TranscriptionStatus.PROCESSING);
    }

    @Override
    public void lockAdmission() {
        transcriptions.lockAdmission();
    }
}
