CREATE TABLE recording_transcription_inputs (
    recording_id BIGINT PRIMARY KEY REFERENCES recording_sessions(id) ON DELETE CASCADE,
    source_storage_key TEXT NOT NULL,
    source_version_id TEXT NOT NULL CHECK (length(trim(source_version_id)) > 0 AND source_version_id <> 'null'),
    source_content_type TEXT NOT NULL,
    source_content_length BIGINT NOT NULL CHECK (source_content_length > 0),
    status VARCHAR(20) NOT NULL CHECK (status IN ('QUEUED','PROCESSING','READY','FAILED','CANCELLED')),
    attempt_id UUID NOT NULL UNIQUE,
    owner_token UUID,
    claim_epoch BIGINT NOT NULL DEFAULT 0 CHECK (claim_epoch >= 0),
    lease_until TIMESTAMPTZ,
    execution_deadline TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ NOT NULL,
    failure_code VARCHAR(100),
    storage_key TEXT,
    storage_version_id TEXT,
    checksum_sha256 VARCHAR(44),
    byte_length BIGINT NOT NULL DEFAULT 0,
    total_frames BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_input_owner CHECK ((status='PROCESSING' AND owner_token IS NOT NULL AND lease_until IS NOT NULL)
        OR (status<>'PROCESSING' AND owner_token IS NULL AND lease_until IS NULL)),
    CONSTRAINT ck_input_ready CHECK (status<>'READY' OR (storage_key IS NOT NULL AND storage_version_id IS NOT NULL
        AND storage_version_id <> 'null' AND length(trim(storage_version_id)) > 0
        AND checksum_sha256 IS NOT NULL AND checksum_sha256 ~ '^[A-Za-z0-9+/]{43}=$' AND total_frames BETWEEN 1 AND 115200000
        AND byte_length=44+total_frames*2)),
    CONSTRAINT ck_input_failed CHECK ((status='FAILED')=(failure_code IS NOT NULL))
);
CREATE UNIQUE INDEX uk_input_preparation_processing ON recording_transcription_inputs ((TRUE)) WHERE status='PROCESSING';
CREATE INDEX idx_input_preparation_due ON recording_transcription_inputs(next_run_at,recording_id)
    WHERE status IN ('QUEUED','PROCESSING');
