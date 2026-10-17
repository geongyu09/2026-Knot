-- 외부 객체 추적은 부모 행의 수명과 독립적이어야 하므로 의도적으로 FK를 두지 않는다.
CREATE TABLE recording_audio_cleanup (
    recording_id BIGINT PRIMARY KEY CHECK (recording_id > 0),
    storage_prefix TEXT NOT NULL UNIQUE,
    scope VARCHAR(20) NOT NULL DEFAULT 'DORMANT' CHECK (scope IN ('DORMANT', 'RAW', 'ALL')),
    created_at TIMESTAMPTZ NOT NULL,
    requested_at TIMESTAMPTZ,
    max_url_expires_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ,
    lease_until TIMESTAMPTZ,
    claim_epoch BIGINT NOT NULL DEFAULT 0 CHECK (claim_epoch >= 0),
    last_swept_at TIMESTAMPTZ,
    last_failure_code VARCHAR(100),
    CONSTRAINT chk_audio_cleanup_prefix CHECK (storage_prefix = 'recordings/' || recording_id || '/'),
    CONSTRAINT chk_audio_cleanup_request CHECK (
        (scope = 'DORMANT' AND requested_at IS NULL AND next_attempt_at IS NULL AND lease_until IS NULL)
        OR (scope <> 'DORMANT' AND requested_at IS NOT NULL AND next_attempt_at IS NOT NULL)
    )
);
CREATE INDEX idx_audio_cleanup_due ON recording_audio_cleanup (next_attempt_at, recording_id)
    WHERE scope <> 'DORMANT';
INSERT INTO recording_audio_cleanup (recording_id, storage_prefix, created_at)
SELECT s.recording_id, 'recordings/' || s.recording_id || '/', r.started_at
FROM recording_audio_streams s JOIN recording_sessions r ON r.id = s.recording_id;
