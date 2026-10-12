ALTER TABLE recording_sessions
    DROP CONSTRAINT chk_recording_sessions_end_reason,
    ADD CONSTRAINT chk_recording_sessions_end_reason
        CHECK (
            end_reason IS NULL
            OR (status = 'ENDED' AND end_reason IN ('USER_ENDED', 'CONNECTION_EXPIRED', 'MAX_DURATION'))
        );
