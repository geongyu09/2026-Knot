ALTER TABLE search_evidences DROP CONSTRAINT ck_search_evidences_rank;
ALTER TABLE search_evidences ALTER COLUMN rank TYPE INTEGER;
ALTER TABLE search_evidences ADD CONSTRAINT ck_search_evidences_rank CHECK (rank > 0);
