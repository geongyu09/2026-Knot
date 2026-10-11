ALTER TABLE recording_sessions
    ADD COLUMN end_reason VARCHAR(30);

ALTER TABLE recording_sessions
    DROP CONSTRAINT chk_recording_sessions_status_timestamps,
    ADD CONSTRAINT chk_recording_sessions_status_timestamps
        CHECK (
            (
                status = 'RECORDING'
                AND current_interval_started_at IS NOT NULL
                AND ended_at IS NULL
                AND current_interval_started_at >= started_at
                AND last_seen_at >= current_interval_started_at
            )
            OR (
                status = 'PAUSED'
                AND current_interval_started_at IS NULL
                AND ended_at IS NULL
                AND last_seen_at >= started_at
            )
            OR (
                status = 'ENDED'
                AND current_interval_started_at IS NULL
                AND ended_at IS NOT NULL
                AND ended_at >= started_at
                AND last_seen_at <= ended_at
            )
            OR (
                status = 'DISCARDED'
                AND current_interval_started_at IS NULL
                AND ended_at IS NOT NULL
                AND ended_at >= started_at
                AND last_seen_at = ended_at
            )
        ),
    ADD CONSTRAINT chk_recording_sessions_end_reason
        CHECK (
            end_reason IS NULL
            OR (status = 'ENDED' AND end_reason IN ('USER_ENDED', 'CONNECTION_EXPIRED'))
        );
