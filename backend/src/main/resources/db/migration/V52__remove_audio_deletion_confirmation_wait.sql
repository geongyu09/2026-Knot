ALTER TABLE recording_audio_deletion_tasks
    DROP CONSTRAINT ck_audio_deletion_state;

ALTER TABLE recording_audio_deletion_tasks
    DROP COLUMN confirmation_after;

ALTER TABLE recording_audio_deletion_tasks
    ADD CONSTRAINT ck_audio_deletion_state CHECK (
        (status = 'PENDING' AND next_attempt_at >= requested_at AND next_attempt_at IS NOT NULL
            AND execution_deadline_at IS NULL AND completed_at IS NULL)
        OR (status = 'RUNNING' AND next_attempt_at IS NULL AND attempt_count > 0
            AND execution_deadline_at > requested_at AND execution_deadline_at IS NOT NULL AND completed_at IS NULL)
        OR (status = 'SUCCEEDED' AND next_attempt_at IS NULL AND execution_deadline_at IS NULL
            AND completed_at >= requested_at AND completed_at IS NOT NULL)
    );

ALTER TABLE recording_audio_uploads
    DROP CONSTRAINT ck_audio_url_expiry;

ALTER TABLE recording_audio_uploads
    DROP COLUMN last_upload_url_expires_at;
