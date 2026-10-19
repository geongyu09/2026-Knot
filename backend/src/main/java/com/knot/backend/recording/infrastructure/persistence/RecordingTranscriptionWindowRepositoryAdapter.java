package com.knot.backend.recording.infrastructure.persistence;

import com.knot.backend.recording.domain.model.RecordingTranscriptionWindow;
import com.knot.backend.recording.domain.repository.RecordingTranscriptionWindowRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class RecordingTranscriptionWindowRepositoryAdapter implements RecordingTranscriptionWindowRepository {
    private final RecordingTranscriptionWindowJpaRepository repository;

    @Override
    public RecordingTranscriptionWindow save(RecordingTranscriptionWindow window) {
        return repository.saveAndFlush(window);
    }

    @Override
    public List<RecordingTranscriptionWindow> findByRecordingIdAndPipelineVersionOrderByWindowIndex(
            long recordingId,
            String pipelineVersion
    ) {
        return repository.findByRecordingIdAndPipelineVersionOrderByWindowIndex(
                recordingId,
                pipelineVersion
        );
    }

    @Override
    public Optional<RecordingTranscriptionWindow> findByIdForUpdate(long id) {
        return repository.findByIdForUpdate(id);
    }

    @Override
    public Optional<RecordingTranscriptionWindow> findByRecordingIdAndPipelineVersionAndWindowIndex(
            long recordingId,
            String pipelineVersion,
            int windowIndex
    ) {
        return repository.findByRecordingIdAndPipelineVersionAndWindowIndex(
                recordingId,
                pipelineVersion,
                windowIndex
        );
    }

    @Override
    public List<Long> findReadyIds(
            Instant now,
            int limit
    ) {
        return repository.findReadyIds(
                now,
                limit
        );
    }

    @Override
    public List<Long> findExpiredIds(
            Instant now,
            int limit
    ) {
        return repository.findExpiredIds(
                now,
                limit
        );
    }

    @Override
    public void cancelAllByRecordingId(long recordingId) {
        repository.findAllByRecordingIdForUpdate(recordingId)
                .forEach(RecordingTranscriptionWindow::cancel);
    }
}
