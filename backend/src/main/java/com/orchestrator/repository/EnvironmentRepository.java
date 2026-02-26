package com.orchestrator.repository;

import com.orchestrator.model.Environment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EnvironmentRepository extends JpaRepository<Environment, UUID>, JpaSpecificationExecutor<Environment> {

    @Query("SELECT e FROM Environment e LEFT JOIN FETCH e.variables v LEFT JOIN FETCH e.headers h WHERE e.id = :id ORDER BY v.sortOrder, h.sortOrder")
    Optional<Environment> findByIdWithDetails(UUID id);

    @Query("SELECT DISTINCT e FROM Environment e LEFT JOIN FETCH e.variables v WHERE e.id IN :ids ORDER BY v.sortOrder")
    List<Environment> findByIdsWithVariables(@Param("ids") List<UUID> ids);

    @Query("SELECT DISTINCT e FROM Environment e LEFT JOIN FETCH e.headers h WHERE e.id IN :ids ORDER BY h.sortOrder")
    List<Environment> findByIdsWithHeaders(@Param("ids") List<UUID> ids);

    @Query("SELECT e FROM Environment e LEFT JOIN FETCH e.connectors WHERE e.id = :id")
    Optional<Environment> findByIdWithConnectors(@Param("id") UUID id);

    @Query("SELECT DISTINCT e FROM Environment e LEFT JOIN FETCH e.connectors c WHERE e.id IN :ids ORDER BY c.sortOrder")
    List<Environment> findByIdsWithConnectors(@Param("ids") List<UUID> ids);

    boolean existsByName(String name);

    boolean existsByNameAndIdNot(String name, UUID id);
}
