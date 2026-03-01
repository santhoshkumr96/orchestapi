package com.orchestrator.repository;

import com.orchestrator.model.Webhook;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.UUID;

public interface WebhookRepository extends JpaRepository<Webhook, UUID>, JpaSpecificationExecutor<Webhook> {

    boolean existsByName(String name);

    boolean existsByNameAndIdNot(String name, UUID id);
}
