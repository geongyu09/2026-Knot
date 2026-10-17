ALTER TABLE transcript_segments
    ADD COLUMN created_at TIMESTAMPTZ;

UPDATE transcript_segments AS segment
SET created_at = transcript.created_at
FROM transcripts AS transcript
WHERE transcript.id = segment.transcript_id;

ALTER TABLE transcript_segments
    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN created_at SET NOT NULL;
