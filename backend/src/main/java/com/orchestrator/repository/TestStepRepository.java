package com.orchestrator.repository;

import com.orchestrator.model.TestStep;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TestStepRepository extends JpaRepository<TestStep, UUID> {

    @Query("SELECT s FROM TestStep s WHERE s.suite.id = :suiteId ORDER BY s.sortOrder")
    List<TestStep> findBySuiteIdOrdered(@Param("suiteId") UUID suiteId);

    @Query("SELECT s FROM TestStep s LEFT JOIN FETCH s.dependencies LEFT JOIN FETCH s.responseHandlers LEFT JOIN FETCH s.extractVariables WHERE s.id = :id")
    Optional<TestStep> findByIdWithDetails(@Param("id") UUID id);

    @Query("SELECT DISTINCT s FROM TestStep s LEFT JOIN FETCH s.dependencies LEFT JOIN FETCH s.responseHandlers LEFT JOIN FETCH s.extractVariables WHERE s.suite.id = :suiteId ORDER BY s.sortOrder")
    List<TestStep> findBySuiteIdWithDetails(@Param("suiteId") UUID suiteId);

    @Query("SELECT s FROM TestStep s LEFT JOIN FETCH s.verifications v LEFT JOIN FETCH v.assertions WHERE s.id = :id")
    Optional<TestStep> findByIdWithVerifications(@Param("id") UUID id);

    @Query("SELECT DISTINCT s FROM TestStep s LEFT JOIN FETCH s.verifications v LEFT JOIN FETCH v.assertions WHERE s.suite.id = :suiteId")
    List<TestStep> findBySuiteIdWithVerifications(@Param("suiteId") UUID suiteId);

    @Query("SELECT s FROM TestStep s LEFT JOIN FETCH s.responseValidations WHERE s.id = :id")
    Optional<TestStep> findByIdWithResponseValidations(@Param("id") UUID id);

    @Query("SELECT DISTINCT s FROM TestStep s LEFT JOIN FETCH s.responseValidations WHERE s.suite.id = :suiteId")
    List<TestStep> findBySuiteIdWithResponseValidations(@Param("suiteId") UUID suiteId);

    boolean existsByNameAndSuiteId(String name, UUID suiteId);

    boolean existsByNameAndSuiteIdAndIdNot(String name, UUID suiteId, UUID id);
}
