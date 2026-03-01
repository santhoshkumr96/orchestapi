package com.orchestrator.repository;

import com.orchestrator.model.WebhookRequestLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface WebhookRequestLogRepository extends JpaRepository<WebhookRequestLog, UUID> {

    Page<WebhookRequestLog> findByWebhookId(UUID webhookId, Pageable pageable);

    long countByWebhookId(UUID webhookId);

    @Modifying
    @Query("DELETE FROM WebhookRequestLog l WHERE l.webhookId = :webhookId")
    void deleteByWebhookId(@Param("webhookId") UUID webhookId);

    @Modifying
    @Query(value = "DELETE FROM orchestrator.orchestapi_webhook_request_logs " +
            "WHERE webhook_id = :webhookId AND id NOT IN (" +
            "  SELECT id FROM orchestrator.orchestapi_webhook_request_logs " +
            "  WHERE webhook_id = :webhookId ORDER BY created_at DESC LIMIT :keepCount" +
            ")", nativeQuery = true)
    void trimOldLogs(@Param("webhookId") UUID webhookId, @Param("keepCount") int keepCount);
}
