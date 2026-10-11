package com.knot.backend.recording.infrastructure;

import com.knot.backend.recording.domain.RecordingSession;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

interface RecordingDetailReadJpaRepository extends Repository<RecordingSession, Long> {

    @Query("""
            select new com.knot.backend.recording.infrastructure.RecordingDetailRow(
                rs.memberId, rs.status, rs.currentIntervalStartedAt,
                rs.accumulatedRecordingMillis, rs.endedAt, rs.endReason, u.status
            )
            from RecordingSession rs
            left join RecordingAudioUpload u on u.recordingId = rs.id
            where rs.workspaceId = :workspaceId and rs.id = :recordingId
            """)
    Optional<RecordingDetailRow> findDetail(
            long workspaceId,
            long recordingId
    );
}
