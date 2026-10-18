package com.knot.backend.recording.infrastructure.persistence;

import com.knot.backend.recording.domain.model.RecordingTranscriptionInput;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

interface RecordingTranscriptionInputJpaRepository extends JpaRepository<RecordingTranscriptionInput, Long> {
    @Query("""
            SELECT i FROM RecordingTranscriptionInput i
            WHERE i.status=com.knot.backend.recording.domain.model.InputPreparationStatus.PROCESSING
            """)
    Optional<RecordingTranscriptionInput> findProcessing();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM RecordingTranscriptionInput i WHERE i.recordingId=:recordingId")
    Optional<RecordingTranscriptionInput> findForUpdate(long recordingId);
}
