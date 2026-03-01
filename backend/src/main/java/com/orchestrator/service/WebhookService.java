package com.orchestrator.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestrator.dto.*;
import com.orchestrator.exception.NotFoundException;
import com.orchestrator.model.Webhook;
import com.orchestrator.repository.WebhookRepository;
import com.orchestrator.repository.WebhookRequestLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class WebhookService {

    private final WebhookRepository webhookRepository;
    private final WebhookRequestLogRepository logRepository;
    private final ObjectMapper objectMapper;

    // ── CRUD ─────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PageResponse<WebhookResponse> findAll(String name, String description, Pageable pageable) {
        Specification<Webhook> spec = Specification.where(null);

        if (name != null && !name.isBlank()) {
            spec = spec.and((root, query, cb) ->
                    cb.like(cb.lower(root.get("name")), "%" + name.toLowerCase() + "%"));
        }
        if (description != null && !description.isBlank()) {
            spec = spec.and((root, query, cb) ->
                    cb.like(cb.lower(root.get("description")), "%" + description.toLowerCase() + "%"));
        }

        Page<Webhook> page = webhookRepository.findAll(spec, pageable);
        return PageResponse.from(page, webhook -> {
            long count = logRepository.countByWebhookId(webhook.getId());
            return WebhookResponse.fromWithCount(webhook, count);
        });
    }

    @Transactional(readOnly = true)
    public WebhookResponse findById(UUID id) {
        Webhook webhook = webhookRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Webhook not found: " + id));
        long count = logRepository.countByWebhookId(id);
        return WebhookResponse.fromWithCount(webhook, count);
    }

    @Transactional
    public WebhookResponse create(WebhookRequest request) {
        if (webhookRepository.existsByName(request.getName())) {
            throw new IllegalArgumentException("Webhook with name '" + request.getName() + "' already exists");
        }

        Webhook webhook = Webhook.builder()
                .name(request.getName())
                .description(request.getDescription())
                .defaultResponseStatus(request.getDefaultResponseStatus())
                .defaultResponseBody(request.getDefaultResponseBody())
                .defaultResponseHeaders(serializeHeaders(request.getDefaultResponseHeaders()))
                .build();
        webhook = webhookRepository.save(webhook);
        return WebhookResponse.from(webhook);
    }

    @Transactional
    public WebhookResponse update(UUID id, WebhookRequest request) {
        Webhook webhook = webhookRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Webhook not found: " + id));

        if (webhookRepository.existsByNameAndIdNot(request.getName(), id)) {
            throw new IllegalArgumentException("Webhook with name '" + request.getName() + "' already exists");
        }

        webhook.setName(request.getName());
        webhook.setDescription(request.getDescription());
        webhook.setDefaultResponseStatus(request.getDefaultResponseStatus());
        webhook.setDefaultResponseBody(request.getDefaultResponseBody());
        webhook.setDefaultResponseHeaders(serializeHeaders(request.getDefaultResponseHeaders()));
        webhook = webhookRepository.save(webhook);
        long count = logRepository.countByWebhookId(id);
        return WebhookResponse.fromWithCount(webhook, count);
    }

    @Transactional
    public void deleteById(UUID id) {
        Webhook webhook = webhookRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Webhook not found: " + id));
        webhook.setDeletedAt(LocalDateTime.now());
        webhookRepository.save(webhook);
    }

    @Transactional
    public WebhookResponse toggleEnabled(UUID id, boolean enabled) {
        Webhook webhook = webhookRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Webhook not found: " + id));
        webhook.setEnabled(enabled);
        webhookRepository.save(webhook);
        long count = logRepository.countByWebhookId(id);
        return WebhookResponse.fromWithCount(webhook, count);
    }

    // ── Request Logs ─────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PageResponse<WebhookRequestLogResponse> getLogs(UUID webhookId, Pageable pageable) {
        return PageResponse.from(
                logRepository.findByWebhookId(webhookId, pageable),
                WebhookRequestLogResponse::from);
    }

    @Transactional
    public void clearLogs(UUID webhookId) {
        logRepository.deleteByWebhookId(webhookId);
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private String serializeHeaders(List<KeyValuePair> headers) {
        try {
            return objectMapper.writeValueAsString(headers != null ? headers : List.of());
        } catch (Exception e) {
            return "[]";
        }
    }
}
