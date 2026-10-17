ALTER TABLE recording_transcriptions
    ADD COLUMN queued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE recording_transcriptions SET queued_at = started_at;

ALTER TABLE recording_transcriptions
    ALTER COLUMN started_at DROP NOT NULL,
    DROP CONSTRAINT chk_recording_transcriptions_status,
    DROP CONSTRAINT chk_recording_transcriptions_state,
    DROP CONSTRAINT chk_recording_transcriptions_time,
    ADD CONSTRAINT chk_recording_transcriptions_status
        CHECK (status IN ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
    ADD CONSTRAINT chk_recording_transcriptions_state CHECK (
        (status = 'QUEUED' AND started_at IS NULL AND failure_code IS NULL AND finished_at IS NULL)
        OR (status = 'PROCESSING' AND started_at IS NOT NULL AND failure_code IS NULL AND finished_at IS NULL)
        OR (status = 'SUCCEEDED' AND started_at IS NOT NULL AND failure_code IS NULL AND finished_at IS NOT NULL)
        OR (status = 'FAILED' AND started_at IS NOT NULL AND failure_code IS NOT NULL
            AND length(trim(failure_code)) > 0 AND finished_at IS NOT NULL)
    ),
    ADD CONSTRAINT chk_recording_transcriptions_time CHECK (
        finished_at IS NULL OR finished_at >= started_at
    );

CREATE INDEX idx_recording_transcriptions_queued
    ON recording_transcriptions (queued_at, id) WHERE status = 'QUEUED';
