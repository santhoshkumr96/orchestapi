package com.orchestrator.repository;

import com.orchestrator.model.TestSuite;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TestSuiteRepository extends JpaRepository<TestSuite, UUID>, JpaSpecificationExecutor<TestSuite> {

    @Query("SELECT s FROM TestSuite s LEFT JOIN FETCH s.steps st WHERE s.id = :id ORDER BY st.sortOrder")
    Optional<TestSuite> findByIdWithSteps(@Param("id") UUID id);

    @Query("SELECT DISTINCT s FROM TestSuite s LEFT JOIN FETCH s.steps st WHERE s.id IN :ids ORDER BY st.sortOrder")
    List<TestSuite> findByIdsWithSteps(@Param("ids") List<UUID> ids);

    boolean existsByName(String name);

    boolean existsByNameAndIdNot(String name, UUID id);
}
