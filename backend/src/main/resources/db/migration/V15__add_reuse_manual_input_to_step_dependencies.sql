ALTER TABLE orchestrator.step_dependencies
    ADD COLUMN reuse_manual_input BOOLEAN NOT NULL DEFAULT true;
