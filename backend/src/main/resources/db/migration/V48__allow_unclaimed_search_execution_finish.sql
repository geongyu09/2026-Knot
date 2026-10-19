ALTER TABLE search_answer_executions DROP CONSTRAINT ck_search_answer_executions_lease;
ALTER TABLE search_answer_executions ADD CONSTRAINT ck_search_answer_executions_lease CHECK (
    (state = 'QUEUED' AND execution_token IS NULL AND deadline_at IS NULL AND stage IS NULL)
    OR (state = 'RUNNING' AND execution_token IS NOT NULL AND deadline_at IS NOT NULL AND stage IS NOT NULL)
    OR (state = 'FINISHED' AND (
        (execution_token IS NULL AND deadline_at IS NULL AND stage IS NULL)
        OR (execution_token IS NOT NULL AND deadline_at IS NOT NULL AND stage IS NOT NULL)
    ))
);
