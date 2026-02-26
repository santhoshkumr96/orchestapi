CREATE TABLE orchestrator.step_verifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    step_id         UUID NOT NULL REFERENCES orchestrator.test_steps(id) ON DELETE CASCADE,
    connector_name  VARCHAR(100) NOT NULL,
    query           TEXT NOT NULL DEFAULT '',
    timeout_seconds INT NOT NULL DEFAULT 30,
    pre_listen      BOOLEAN NOT NULL DEFAULT false,
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);
