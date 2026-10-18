package com.knot.backend.recording.domain.model;

import com.knot.backend.recording.domain.RecordingErrorCode;
import com.knot.backend.recording.domain.RecordingException;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;

@Getter
@Entity
@Table(name = "transcripts")
public class Transcript {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "recording_session_id", nullable = false, updatable = false)
    private long recordingSessionId;

    @Column(name = "content", nullable = false, updatable = false, columnDefinition = "text")
    private String rawTranscriptJson;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected Transcript() {}

    private Transcript(
            long recordingSessionId,
            String rawTranscriptJson,
            Instant createdAt
    ) {
        if (recordingSessionId <= 0 || rawTranscriptJson == null || rawTranscriptJson.isBlank() || createdAt == null) {
            throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_DATA);
        }
        this.recordingSessionId = recordingSessionId;
        this.rawTranscriptJson = rawTranscriptJson;
        this.createdAt = createdAt;
    }

    public static Transcript create(
            long recordingSessionId,
            String rawTranscriptJson,
            Instant createdAt
    ) {
        return new Transcript(
                recordingSessionId,
                rawTranscriptJson,
                createdAt
        );
    }
}
