CREATE TABLE orchestrator.test_suites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT DEFAULT '',
    default_environment_id UUID REFERENCES orchestrator.environments(id) ON DELETE SET NULL,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX test_suites_name_unique_active
    ON orchestrator.test_suites (name)
    WHERE deleted_at IS NULL;
