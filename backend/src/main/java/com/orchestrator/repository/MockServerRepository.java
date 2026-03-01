package com.orchestrator.repository;

import com.orchestrator.model.MockServer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface MockServerRepository extends JpaRepository<MockServer, UUID>, JpaSpecificationExecutor<MockServer> {

    boolean existsByName(String name);

    boolean existsByNameAndIdNot(String name, UUID id);

    @Query("SELECT s FROM MockServer s LEFT JOIN FETCH s.endpoints e LEFT JOIN FETCH e.matchRules WHERE s.id = :id")
    Optional<MockServer> findByIdWithEndpoints(@Param("id") UUID id);
}
