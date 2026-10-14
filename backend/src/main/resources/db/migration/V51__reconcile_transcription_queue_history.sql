ALTER TABLE recording_audio_uploads
    ADD COLUMN IF NOT EXISTS storage_version_id TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'recording_audio_uploads'::regclass
            AND conname = 'chk_recording_audio_uploads_storage_version'
    ) THEN
        ALTER TABLE recording_audio_uploads
            ADD CONSTRAINT chk_recording_audio_uploads_storage_version CHECK (
                storage_version_id IS NULL OR status = 'COMPLETED'
            );
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
            AND table_name = 'recording_transcriptions' AND column_name = 'queued_at'
    ) THEN
        ALTER TABLE recording_transcriptions
            DROP CONSTRAINT IF EXISTS chk_recording_transcriptions_state,
            DROP CONSTRAINT IF EXISTS chk_recording_transcriptions_time,
            ADD CONSTRAINT chk_recording_transcriptions_state CHECK (
                (status = 'QUEUED' AND started_at IS NULL AND failure_code IS NULL AND finished_at IS NULL)
                OR (status IN ('PROCESSING', 'SUCCEEDED') AND started_at IS NOT NULL AND failure_code IS NULL)
                OR (status = 'FAILED' AND started_at IS NOT NULL AND failure_code IS NOT NULL
                    AND length(trim(failure_code)) > 0)
            );
    END IF;
END $$;
