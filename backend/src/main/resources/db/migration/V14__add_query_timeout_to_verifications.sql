ALTER TABLE orchestrator.step_verifications
    ADD COLUMN query_timeout_seconds INT NOT NULL DEFAULT 30;
