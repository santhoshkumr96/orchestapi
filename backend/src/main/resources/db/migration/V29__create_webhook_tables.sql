-- Webhook Tester tables

CREATE TABLE orchestrator.orchestapi_webhooks (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                     VARCHAR(200) NOT NULL,
    description              TEXT,
    enabled                  BOOLEAN NOT NULL DEFAULT TRUE,
    default_response_status  INTEGER NOT NULL DEFAULT 200,
    default_response_body    TEXT,
    default_response_headers JSONB DEFAULT '[]',
    created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at               TIMESTAMP
);

CREATE UNIQUE INDEX idx_webhooks_name_active
    ON orchestrator.orchestapi_webhooks(name) WHERE deleted_at IS NULL;

CREATE TABLE orchestrator.orchestapi_webhook_request_logs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id       UUID NOT NULL REFERENCES orchestrator.orchestapi_webhooks(id),
    http_method      VARCHAR(10) NOT NULL,
    request_path     VARCHAR(2000) NOT NULL,
    request_headers  JSONB,
    request_body     TEXT,
    query_params     JSONB,
    content_type     VARCHAR(200),
    content_length   BIGINT,
    source_ip        VARCHAR(45),
    is_multipart     BOOLEAN NOT NULL DEFAULT FALSE,
    files            JSONB,
    response_status  INTEGER,
    response_body    TEXT,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_request_logs_webhook ON orchestrator.orchestapi_webhook_request_logs(webhook_id);
CREATE INDEX idx_webhook_request_logs_created ON orchestrator.orchestapi_webhook_request_logs(created_at DESC);
