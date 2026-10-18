ALTER TABLE recording_sessions ADD COLUMN incremental_pipeline_version VARCHAR(64);
ALTER TABLE recording_transcription_windows ADD COLUMN last_claimed_at TIMESTAMPTZ;
ALTER TABLE recording_sessions ADD CONSTRAINT chk_recording_incremental_pipeline
    CHECK (incremental_pipeline_version IS NULL OR
        (audio_mode = 'PCM16_CHUNKS_V1' AND incremental_pipeline_version = 'pcm-window-v1-30-5'));

CREATE INDEX idx_recording_incremental_pending ON recording_sessions (id)
    WHERE incremental_pipeline_version IS NOT NULL AND status <> 'DISCARDED';

CREATE UNIQUE INDEX uk_transcription_window_processing ON recording_transcription_windows ((TRUE))
    WHERE status = 'PROCESSING';

CREATE INDEX idx_transcription_window_last_claimed
    ON recording_transcription_windows (recording_id, last_claimed_at DESC)
    WHERE last_claimed_at IS NOT NULL;
