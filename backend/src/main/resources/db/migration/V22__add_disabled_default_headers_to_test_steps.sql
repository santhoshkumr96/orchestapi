ALTER TABLE orchestrator.test_steps
    ADD COLUMN disabled_default_headers jsonb NOT NULL DEFAULT '[]';
