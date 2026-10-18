package com.knot.backend.recording.infrastructure.persistence;

import com.knot.backend.recording.domain.model.RecordingTranscriptionInput;
import com.knot.backend.recording.domain.repository.RecordingTranscriptionInputRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class RecordingTranscriptionInputRepositoryAdapter implements RecordingTranscriptionInputRepository {
    private final RecordingTranscriptionInputJpaRepository repository;
    private final JdbcClient jdbc;

    public RecordingTranscriptionInput save(RecordingTranscriptionInput input) {
        return repository.saveAndFlush(input);
    }

    public Optional<RecordingTranscriptionInput> findByRecordingId(long id) {
        return repository.findById(id);
    }

    public Optional<RecordingTranscriptionInput> findByRecordingIdForUpdate(long id) {
        return repository.findForUpdate(id);
    }

    public List<Long> findCandidates(
            Instant now,
            int limit
    ) {
        return jdbc.sql("""
                SELECT recording_id FROM recording_transcription_inputs
                WHERE status='PROCESSING' OR (status='QUEUED' AND next_run_at <= :now)
                ORDER BY CASE WHEN status='PROCESSING' THEN 0 ELSE 1 END,next_run_at,recording_id LIMIT :limit
                """)
                .param(
                        "now",
                        java.sql.Timestamp.from(now)
                )
                .param(
                        "limit",
                        limit
                )
                .query(Long.class)
                .list();
    }

    public Optional<RecordingTranscriptionInput> findProcessing() {
        return repository.findProcessing();
    }

    public void lockAdmission() {
        jdbc.sql("SELECT 1 FROM pg_advisory_xact_lock(640)")
                .query(Integer.class)
                .single();
    }

    public void cancelByRecordingId(long id) {
        repository.findForUpdate(id)
                .ifPresent(RecordingTranscriptionInput::cancel);
    }
}
