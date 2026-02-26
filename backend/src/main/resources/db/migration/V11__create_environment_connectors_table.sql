CREATE TABLE orchestrator.environment_connectors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id  UUID NOT NULL REFERENCES orchestrator.environments(id),
    name            VARCHAR(100) NOT NULL,
    type            VARCHAR(30) NOT NULL,
    config          JSONB NOT NULL DEFAULT '{}',
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(environment_id, name)
);
