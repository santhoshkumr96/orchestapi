CREATE TABLE orchestrator.test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite_id UUID NOT NULL REFERENCES orchestrator.test_suites(id),
    environment_id UUID NOT NULL REFERENCES orchestrator.environments(id),
    trigger_type VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
    schedule_id UUID,
    status VARCHAR(30) NOT NULL DEFAULT 'RUNNING',
    started_at TIMESTAMP NOT NULL DEFAULT now(),
    completed_at TIMESTAMP,
    total_duration_ms BIGINT DEFAULT 0,
    result_data JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    deleted_at TIMESTAMP
);

CREATE INDEX idx_test_runs_suite_id ON orchestrator.test_runs(suite_id);
CREATE INDEX idx_test_runs_environment_id ON orchestrator.test_runs(environment_id);
CREATE INDEX idx_test_runs_status ON orchestrator.test_runs(status);
CREATE INDEX idx_test_runs_trigger_type ON orchestrator.test_runs(trigger_type);
CREATE INDEX idx_test_runs_started_at ON orchestrator.test_runs(started_at);
