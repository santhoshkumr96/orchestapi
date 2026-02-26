CREATE TABLE orchestrator.step_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    step_id UUID NOT NULL REFERENCES orchestrator.test_steps(id) ON DELETE CASCADE,
    depends_on_step_id UUID NOT NULL REFERENCES orchestrator.test_steps(id) ON DELETE CASCADE,
    use_cache BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT uq_step_dependency UNIQUE (step_id, depends_on_step_id),
    CONSTRAINT chk_no_self_dependency CHECK (step_id != depends_on_step_id)
);

CREATE INDEX idx_step_deps_step_id ON orchestrator.step_dependencies(step_id);
CREATE INDEX idx_step_deps_depends_on ON orchestrator.step_dependencies(depends_on_step_id);
