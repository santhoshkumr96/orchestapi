CREATE TABLE orchestrator.verification_assertions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_id     UUID NOT NULL REFERENCES orchestrator.step_verifications(id) ON DELETE CASCADE,
    json_path           VARCHAR(500) NOT NULL,
    operator            VARCHAR(20) NOT NULL,
    expected_value      TEXT NOT NULL DEFAULT '',
    sort_order          INT NOT NULL DEFAULT 0
);
