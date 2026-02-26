ALTER TABLE orchestrator.environment_variables
    ADD COLUMN value_type VARCHAR(20) NOT NULL DEFAULT 'STATIC';
