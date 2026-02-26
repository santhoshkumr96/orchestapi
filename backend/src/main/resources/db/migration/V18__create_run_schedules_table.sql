CREATE TABLE orchestrator.run_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite_id UUID NOT NULL REFERENCES orchestrator.test_suites(id),
    environment_id UUID NOT NULL REFERENCES orchestrator.environments(id),
    cron_expression VARCHAR(100) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    description VARCHAR(255),
    last_run_at TIMESTAMP,
    next_run_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    deleted_at TIMESTAMP
);

CREATE INDEX idx_run_schedules_suite_id ON orchestrator.run_schedules(suite_id);
CREATE INDEX idx_run_schedules_active ON orchestrator.run_schedules(active);
