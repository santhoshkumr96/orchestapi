package com.orchestrator.repository;

import com.orchestrator.model.MockRequestLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface MockRequestLogRepository extends JpaRepository<MockRequestLog, UUID> {

    Page<MockRequestLog> findByMockServerId(UUID serverId, Pageable pageable);

    @Modifying
    @Query("DELETE FROM MockRequestLog l WHERE l.mockServerId = :serverId")
    void deleteByMockServerId(@Param("serverId") UUID serverId);
}
