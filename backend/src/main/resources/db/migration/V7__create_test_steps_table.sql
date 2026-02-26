CREATE TABLE orchestrator.test_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite_id UUID NOT NULL REFERENCES orchestrator.test_suites(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    method VARCHAR(10) NOT NULL DEFAULT 'GET',
    url TEXT NOT NULL DEFAULT '',
    headers JSONB DEFAULT '[]'::jsonb,
    body TEXT DEFAULT '',
    query_params JSONB DEFAULT '[]'::jsonb,
    cacheable BOOLEAN NOT NULL DEFAULT false,
    cache_ttl_seconds INT NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_test_steps_suite_id ON orchestrator.test_steps(suite_id);

CREATE UNIQUE INDEX test_steps_name_unique_per_suite
    ON orchestrator.test_steps (suite_id, name)
    WHERE deleted_at IS NULL;
