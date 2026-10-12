CREATE TABLE search_answer_executions (
    answer_id BIGINT NOT NULL,
    conversation_id BIGINT NOT NULL,
    question_id BIGINT NOT NULL,
    state VARCHAR(20) NOT NULL,
    execution_token UUID,
    deadline_at TIMESTAMPTZ,
    stage VARCHAR(20),
    excluded_count INTEGER,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT pk_search_answer_executions PRIMARY KEY (answer_id),
    CONSTRAINT fk_search_answer_executions_answer FOREIGN KEY (answer_id) REFERENCES search_messages(id) ON DELETE RESTRICT,
    CONSTRAINT fk_search_answer_executions_conversation FOREIGN KEY (conversation_id) REFERENCES search_conversations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_search_answer_executions_question FOREIGN KEY (question_id) REFERENCES search_messages(id) ON DELETE RESTRICT,
    CONSTRAINT ck_search_answer_executions_state CHECK (state IN ('QUEUED', 'RUNNING', 'FINISHED')),
    CONSTRAINT ck_search_answer_executions_stage CHECK (stage IN ('SEARCHING', 'GENERATING')),
    CONSTRAINT ck_search_answer_executions_count CHECK (excluded_count >= 0),
    CONSTRAINT ck_search_answer_executions_messages CHECK (answer_id <> question_id),
    CONSTRAINT ck_search_answer_executions_lease CHECK (
        (state = 'QUEUED' AND execution_token IS NULL AND deadline_at IS NULL AND stage IS NULL)
        OR (state IN ('RUNNING', 'FINISHED') AND execution_token IS NOT NULL AND deadline_at IS NOT NULL AND stage IS NOT NULL)
    )
);
CREATE INDEX idx_search_answer_executions_queued ON search_answer_executions(created_at, answer_id) WHERE state = 'QUEUED';
CREATE INDEX idx_search_answer_executions_deadline ON search_answer_executions(deadline_at, answer_id) WHERE state = 'RUNNING';
