SET search_path TO orchestrator;

CREATE TABLE environment_files (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id  UUID NOT NULL REFERENCES environments(id),
    file_key        VARCHAR(255) NOT NULL,
    file_name       VARCHAR(500) NOT NULL,
    content_type    VARCHAR(255),
    file_size       BIGINT NOT NULL DEFAULT 0,
    file_data       BYTEA NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_env_files_key ON environment_files(environment_id, file_key);
CREATE INDEX idx_env_files_env ON environment_files(environment_id);
