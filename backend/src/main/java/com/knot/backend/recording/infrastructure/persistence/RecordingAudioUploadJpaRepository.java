package com.knot.backend.recording.infrastructure.persistence;

import com.knot.backend.recording.domain.model.RecordingAudioUpload;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

interface RecordingAudioUploadJpaRepository extends JpaRepository<RecordingAudioUpload, Long> {

    Optional<RecordingAudioUpload> findByRecordingId(long recordingId);
}
