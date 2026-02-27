CREATE TABLE orchestrator.orchestapi_step_response_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    step_id UUID NOT NULL REFERENCES orchestrator.orchestapi_test_steps(id) ON DELETE CASCADE,
    validation_type VARCHAR(30) NOT NULL,
    header_name VARCHAR(500),
    json_path VARCHAR(500),
    operator VARCHAR(20),
    expected_value TEXT,
    expected_body TEXT,
    strict_match BOOLEAN DEFAULT TRUE,
    expected_type VARCHAR(20),
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_resp_validations_step_id ON orchestrator.orchestapi_step_response_validations(step_id);
