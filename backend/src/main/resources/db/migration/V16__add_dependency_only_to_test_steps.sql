ALTER TABLE orchestrator.test_steps
    ADD COLUMN dependency_only BOOLEAN NOT NULL DEFAULT false;
