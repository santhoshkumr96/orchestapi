package com.orchestrator.repository;

import com.orchestrator.model.MockEndpoint;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MockEndpointRepository extends JpaRepository<MockEndpoint, UUID> {

    @Query("SELECT e FROM MockEndpoint e LEFT JOIN FETCH e.matchRules WHERE e.mockServer.id = :serverId ORDER BY e.sortOrder")
    List<MockEndpoint> findByMockServerIdWithRules(@Param("serverId") UUID serverId);

    @Query("SELECT e FROM MockEndpoint e LEFT JOIN FETCH e.matchRules WHERE e.mockServer.id = :serverId AND e.enabled = true ORDER BY e.sortOrder")
    List<MockEndpoint> findByMockServerIdAndEnabledTrueWithRules(@Param("serverId") UUID serverId);

    @Query("SELECT e FROM MockEndpoint e LEFT JOIN FETCH e.matchRules WHERE e.id = :id")
    Optional<MockEndpoint> findByIdWithRules(@Param("id") UUID id);

    long countByMockServerId(UUID serverId);
}
