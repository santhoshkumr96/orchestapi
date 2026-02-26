CREATE TABLE orchestrator.step_response_handlers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    step_id UUID NOT NULL REFERENCES orchestrator.test_steps(id) ON DELETE CASCADE,
    match_code VARCHAR(10) NOT NULL,
    action VARCHAR(30) NOT NULL DEFAULT 'ERROR',
    side_effect_step_id UUID REFERENCES orchestrator.test_steps(id) ON DELETE SET NULL,
    retry_count INT NOT NULL DEFAULT 0,
    retry_delay_seconds INT NOT NULL DEFAULT 0,
    priority INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_step_handlers_step_id ON orchestrator.step_response_handlers(step_id);
