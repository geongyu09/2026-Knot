ALTER TABLE search_messages ADD COLUMN failure_code VARCHAR(50);
ALTER TABLE search_messages ADD CONSTRAINT ck_search_messages_failure_code
    CHECK (failure_code IS NULL OR (role = 'ASSISTANT' AND status = 'FAILED'));

CREATE TABLE search_request_receipts (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    workspace_id BIGINT NOT NULL,
    member_id BIGINT NOT NULL,
    operation VARCHAR(30) NOT NULL,
    target_id BIGINT NOT NULL,
    request_id UUID NOT NULL,
    conversation_id BIGINT NOT NULL,
    question_message_id BIGINT NOT NULL,
    answer_message_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT pk_search_request_receipts PRIMARY KEY (id),
    CONSTRAINT fk_search_request_receipts_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    CONSTRAINT fk_search_request_receipts_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT,
    CONSTRAINT fk_search_request_receipts_conversation FOREIGN KEY (conversation_id) REFERENCES search_conversations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_search_request_receipts_question FOREIGN KEY (question_message_id) REFERENCES search_messages(id) ON DELETE RESTRICT,
    CONSTRAINT fk_search_request_receipts_answer FOREIGN KEY (answer_message_id) REFERENCES search_messages(id) ON DELETE RESTRICT,
    CONSTRAINT uk_search_request_receipts_scope UNIQUE (workspace_id, member_id, operation, target_id, request_id),
    CONSTRAINT ck_search_request_receipts_target CHECK (target_id >= 0),
    CONSTRAINT ck_search_request_receipts_messages CHECK (question_message_id <> answer_message_id),
    CONSTRAINT ck_search_request_receipts_operation CHECK (operation IN ('FIRST_QUESTION', 'QUESTION', 'RETRY'))
);
CREATE INDEX idx_search_request_receipts_conversation ON search_request_receipts(conversation_id);
