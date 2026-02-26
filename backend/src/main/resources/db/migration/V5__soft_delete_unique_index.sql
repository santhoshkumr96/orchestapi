-- Replace the simple unique constraint with a partial unique index
-- that only enforces uniqueness among non-deleted records
ALTER TABLE orchestrator.environments DROP CONSTRAINT IF EXISTS environments_name_key;
CREATE UNIQUE INDEX environments_name_unique_active
    ON orchestrator.environments (name)
    WHERE deleted_at IS NULL;
