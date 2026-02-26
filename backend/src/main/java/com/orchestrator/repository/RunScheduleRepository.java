package com.orchestrator.repository;

import com.orchestrator.model.RunSchedule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

public interface RunScheduleRepository extends JpaRepository<RunSchedule, UUID>, JpaSpecificationExecutor<RunSchedule> {

    @Query("SELECT s FROM RunSchedule s WHERE s.active = true")
    List<RunSchedule> findAllActive();

    List<RunSchedule> findBySuiteId(UUID suiteId);
}
