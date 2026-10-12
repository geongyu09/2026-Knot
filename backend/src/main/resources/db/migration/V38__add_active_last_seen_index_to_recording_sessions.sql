CREATE INDEX idx_recording_sessions_active_last_seen
    ON recording_sessions (last_seen_at, id)
    WHERE status IN ('RECORDING', 'PAUSED');
