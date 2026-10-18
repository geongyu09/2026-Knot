CREATE TABLE recording_transcription_windows (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recording_id BIGINT NOT NULL REFERENCES recording_sessions(id) ON DELETE CASCADE,
    pipeline_version VARCHAR(64) NOT NULL,
    window_index INTEGER NOT NULL,
    core_start_frame BIGINT NOT NULL,
    core_end_frame BIGINT NOT NULL,
    input_start_frame BIGINT NOT NULL,
    input_end_frame BIGINT NOT NULL,
    manifest_json TEXT NOT NULL,
    manifest_sha256 VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL,
    attempt_id UUID NOT NULL,
    owner_token UUID,
    claim_epoch BIGINT NOT NULL DEFAULT 0,
    lease_until TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ NOT NULL,
    execution_deadline TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    failure_code VARCHAR(100),
    result_schema_version INTEGER,
    result_json TEXT,
    result_sha256 VARCHAR(64),
    CONSTRAINT uk_transcription_window_index UNIQUE (recording_id, pipeline_version, window_index),
    CONSTRAINT uk_transcription_window_start UNIQUE (recording_id, pipeline_version, core_start_frame),
    CONSTRAINT chk_transcription_window_range CHECK (
        window_index >= 0 AND input_start_frame >= 0 AND input_start_frame <= core_start_frame
        AND core_start_frame < core_end_frame AND core_end_frame <= input_end_frame
        AND input_end_frame <= 115200000),
    CONSTRAINT chk_transcription_window_pipeline CHECK (length(trim(pipeline_version)) > 0),
    CONSTRAINT chk_transcription_window_manifest CHECK (
        manifest_sha256 ~ '^[0-9a-f]{64}$' AND manifest_json IS JSON OBJECT
        AND octet_length(manifest_json) <= 1048576),
    CONSTRAINT chk_transcription_window_status CHECK (
        status IN ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
    CONSTRAINT chk_transcription_window_owner CHECK (
        (status = 'PROCESSING' AND owner_token IS NOT NULL AND lease_until IS NOT NULL)
        OR (status <> 'PROCESSING' AND owner_token IS NULL AND lease_until IS NULL)),
    CONSTRAINT chk_transcription_window_epoch CHECK (claim_epoch >= 0),
    CONSTRAINT chk_transcription_window_failure CHECK (
        (status = 'FAILED' AND failure_code IS NOT NULL AND length(trim(failure_code)) > 0)
        OR (status = 'QUEUED' AND (failure_code IS NULL OR length(trim(failure_code)) > 0))
        OR (status NOT IN ('FAILED', 'QUEUED') AND failure_code IS NULL)),
    CONSTRAINT chk_transcription_window_result CHECK (
        (status = 'SUCCEEDED' AND result_schema_version > 0 AND result_schema_version IS NOT NULL
         AND result_json IS NOT NULL AND result_json IS JSON OBJECT
         AND octet_length(result_json) <= 1048576 AND result_sha256 IS NOT NULL
         AND result_sha256 ~ '^[0-9a-f]{64}$')
        OR (status <> 'SUCCEEDED' AND result_schema_version IS NULL
            AND result_json IS NULL AND result_sha256 IS NULL))
);

CREATE INDEX idx_transcription_window_due ON recording_transcription_windows (next_run_at, id)
    WHERE status IN ('QUEUED', 'PROCESSING');
