-- 전사는 key의 최신 버전이 아니라 업로드 완료 때 확인한 객체 버전에 서명한다.
ALTER TABLE recording_audio_uploads
    ADD COLUMN storage_version_id TEXT,
    ADD CONSTRAINT chk_recording_audio_uploads_storage_version CHECK (
        storage_version_id IS NULL OR status = 'COMPLETED'
    );
