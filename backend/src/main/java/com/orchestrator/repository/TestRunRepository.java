package com.orchestrator.repository;

import com.orchestrator.model.TestRun;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.UUID;

public interface TestRunRepository extends JpaRepository<TestRun, UUID>, JpaSpecificationExecutor<TestRun> {
}
