SET search_path TO orchestrator;

ALTER TABLE test_steps ADD COLUMN body_type VARCHAR(20) NOT NULL DEFAULT 'NONE';
ALTER TABLE test_steps ADD COLUMN form_data_fields JSONB NOT NULL DEFAULT '[]';

-- Migrate existing steps that have body content to JSON type
UPDATE test_steps SET body_type = 'JSON' WHERE body IS NOT NULL AND body != '';
