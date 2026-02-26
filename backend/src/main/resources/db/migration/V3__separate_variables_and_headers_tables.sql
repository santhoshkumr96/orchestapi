-- Create environment_variables table
CREATE TABLE orchestrator.environment_variables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id UUID NOT NULL REFERENCES orchestrator.environments(id) ON DELETE CASCADE,
    var_key VARCHAR(255) NOT NULL,
    var_value TEXT NOT NULL DEFAULT '',
    secret BOOLEAN NOT NULL DEFAULT false,
    sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_env_variables_env_id ON orchestrator.environment_variables(environment_id);

-- Create environment_headers table
CREATE TABLE orchestrator.environment_headers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id UUID NOT NULL REFERENCES orchestrator.environments(id) ON DELETE CASCADE,
    header_key VARCHAR(255) NOT NULL,
    value_type VARCHAR(20) NOT NULL DEFAULT 'STATIC',
    header_value TEXT NOT NULL DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_env_headers_env_id ON orchestrator.environment_headers(environment_id);

-- Migrate existing JSONB variables to new table
INSERT INTO orchestrator.environment_variables (environment_id, var_key, var_value, secret, sort_order)
SELECT
    e.id,
    v->>'key',
    COALESCE(v->>'value', ''),
    COALESCE((v->>'secret')::boolean, false),
    row_number() OVER (PARTITION BY e.id ORDER BY ordinality) - 1
FROM orchestrator.environments e,
     jsonb_array_elements(e.variables) WITH ORDINALITY AS t(v, ordinality)
WHERE e.variables IS NOT NULL AND jsonb_array_length(e.variables) > 0;

-- Drop JSONB column
ALTER TABLE orchestrator.environments DROP COLUMN variables;
