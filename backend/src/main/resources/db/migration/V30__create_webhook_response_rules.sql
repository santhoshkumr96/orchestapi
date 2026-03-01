-- Response rules (ordered, first match wins)
CREATE TABLE orchestrator.orchestapi_webhook_response_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES orchestrator.orchestapi_webhooks(id),
    name VARCHAR(200) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    response_status INT NOT NULL DEFAULT 200,
    response_body TEXT,
    response_headers JSONB DEFAULT '[]',
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_response_rules_webhook ON orchestrator.orchestapi_webhook_response_rules(webhook_id);

-- Conditions per rule (AND logic)
CREATE TABLE orchestrator.orchestapi_webhook_rule_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES orchestrator.orchestapi_webhook_response_rules(id) ON DELETE CASCADE,
    condition_type VARCHAR(20) NOT NULL,
    match_key VARCHAR(200) NOT NULL,
    match_value VARCHAR(500),
    sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_webhook_rule_conditions_rule ON orchestrator.orchestapi_webhook_rule_conditions(rule_id);

-- Track which rule matched in request logs
ALTER TABLE orchestrator.orchestapi_webhook_request_logs
    ADD COLUMN matched_rule_name VARCHAR(200);
