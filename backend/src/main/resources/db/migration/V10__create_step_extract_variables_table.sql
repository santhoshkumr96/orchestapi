CREATE TABLE orchestrator.step_extract_variables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    step_id UUID NOT NULL REFERENCES orchestrator.test_steps(id) ON DELETE CASCADE,
    variable_name VARCHAR(200) NOT NULL,
    json_path VARCHAR(500) NOT NULL,
    source VARCHAR(30) NOT NULL DEFAULT 'RESPONSE_BODY'
);

CREATE INDEX idx_step_extract_vars_step_id ON orchestrator.step_extract_variables(step_id);
