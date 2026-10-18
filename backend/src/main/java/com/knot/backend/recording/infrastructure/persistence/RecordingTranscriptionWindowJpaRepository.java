package com.knot.backend.recording.infrastructure.persistence;

import com.knot.backend.recording.domain.model.RecordingTranscriptionWindow;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

interface RecordingTranscriptionWindowJpaRepository extends JpaRepository<RecordingTranscriptionWindow, Long> {
    List<RecordingTranscriptionWindow> findByRecordingIdAndPipelineVersionOrderByWindowIndex(
            long recordingId,
            String pipelineVersion
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT w FROM RecordingTranscriptionWindow w WHERE w.id = :id")
    Optional<RecordingTranscriptionWindow> findByIdForUpdate(long id);

    Optional<RecordingTranscriptionWindow> findByRecordingIdAndPipelineVersionAndWindowIndex(
            long recordingId,
            String pipelineVersion,
            int windowIndex
    );

    @Query(value = """
            SELECT id FROM recording_transcription_windows
            WHERE next_run_at <= :now
                AND (execution_deadline IS NULL OR execution_deadline > :now)
                AND (status = 'QUEUED' OR (status = 'PROCESSING' AND lease_until <= :now))
            ORDER BY next_run_at, id LIMIT :limit
            """, nativeQuery = true)
    List<Long> findReadyIds(
            Instant now,
            int limit
    );

    @Query(value = """
            SELECT id FROM recording_transcription_windows
            WHERE status IN ('QUEUED', 'PROCESSING') AND execution_deadline <= :now
            ORDER BY execution_deadline, id LIMIT :limit
            """, nativeQuery = true)
    List<Long> findExpiredIds(
            Instant now,
            int limit
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT w FROM RecordingTranscriptionWindow w WHERE w.recordingId = :recordingId ORDER BY w.id")
    List<RecordingTranscriptionWindow> findAllByRecordingIdForUpdate(long recordingId);
}
