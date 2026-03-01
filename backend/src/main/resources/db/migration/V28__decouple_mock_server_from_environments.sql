-- Drop V27 tables (no production data yet) and recreate as standalone
DROP TABLE IF EXISTS orchestrator.orchestapi_mock_request_logs;
DROP TABLE IF EXISTS orchestrator.orchestapi_mock_match_rules;
DROP TABLE IF EXISTS orchestrator.orchestapi_mock_endpoints;

-- Remove mock_server_enabled from environments
ALTER TABLE orchestrator.orchestapi_environments
    DROP COLUMN IF EXISTS mock_server_enabled;

-- Create standalone mock_servers table
CREATE TABLE orchestrator.orchestapi_mock_servers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMP
);

CREATE UNIQUE INDEX idx_mock_servers_name_active
    ON orchestrator.orchestapi_mock_servers(name) WHERE deleted_at IS NULL;

-- Recreate mock_endpoints under mock_servers
CREATE TABLE orchestrator.orchestapi_mock_endpoints (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mock_server_id  UUID NOT NULL REFERENCES orchestrator.orchestapi_mock_servers(id),
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    http_method     VARCHAR(10) NOT NULL,
    path_pattern    VARCHAR(500) NOT NULL,
    response_status INTEGER NOT NULL DEFAULT 200,
    response_body   TEXT,
    response_headers JSONB DEFAULT '[]',
    delay_ms        INTEGER NOT NULL DEFAULT 0,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mock_endpoints_server ON orchestrator.orchestapi_mock_endpoints(mock_server_id);

-- Recreate match rules
CREATE TABLE orchestrator.orchestapi_mock_match_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id     UUID NOT NULL REFERENCES orchestrator.orchestapi_mock_endpoints(id) ON DELETE CASCADE,
    rule_type       VARCHAR(20) NOT NULL,
    match_key       VARCHAR(200) NOT NULL,
    match_value     VARCHAR(500),
    sort_order      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_mock_match_rules_endpoint ON orchestrator.orchestapi_mock_match_rules(endpoint_id);

-- Recreate request logs under mock_servers
CREATE TABLE orchestrator.orchestapi_mock_request_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mock_server_id      UUID NOT NULL REFERENCES orchestrator.orchestapi_mock_servers(id),
    matched_endpoint_id UUID REFERENCES orchestrator.orchestapi_mock_endpoints(id) ON DELETE SET NULL,
    http_method         VARCHAR(10) NOT NULL,
    request_path        VARCHAR(1000) NOT NULL,
    request_headers     JSONB,
    request_body        TEXT,
    query_params        JSONB,
    response_status     INTEGER,
    response_body       TEXT,
    matched             BOOLEAN NOT NULL DEFAULT FALSE,
    duration_ms         INTEGER,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mock_request_logs_server ON orchestrator.orchestapi_mock_request_logs(mock_server_id);
CREATE INDEX idx_mock_request_logs_created ON orchestrator.orchestapi_mock_request_logs(created_at DESC);
