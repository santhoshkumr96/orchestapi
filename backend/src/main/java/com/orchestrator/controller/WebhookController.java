package com.orchestrator.controller;

import com.orchestrator.dto.*;
import com.orchestrator.service.WebhookHandlerService;
import com.orchestrator.service.WebhookService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class WebhookController {

    private static final Set<String> ALLOWED_SORT_FIELDS = Set.of("name", "createdAt", "updatedAt");
    private static final int MAX_PAGE_SIZE = 100;

    private final WebhookService webhookService;
    private final WebhookHandlerService webhookHandlerService;

    // ── Webhook CRUD ─────────────────────────────────────────────────────

    @GetMapping("/api/webhooks")
    public PageResponse<WebhookResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String description,
            @RequestParam(defaultValue = "name") String sortBy,
            @RequestParam(defaultValue = "asc") String sortDir) {
        if (!ALLOWED_SORT_FIELDS.contains(sortBy)) sortBy = "name";
        if (size < 1) size = 10;
        if (size > MAX_PAGE_SIZE) size = MAX_PAGE_SIZE;
        if (page < 0) page = 0;

        Sort sort = sortDir.equalsIgnoreCase("desc")
                ? Sort.by(sortBy).descending()
                : Sort.by(sortBy).ascending();
        return webhookService.findAll(name, description, PageRequest.of(page, size, sort));
    }

    @GetMapping("/api/webhooks/{id}")
    public WebhookResponse get(@PathVariable UUID id) {
        return webhookService.findById(id);
    }

    @PostMapping("/api/webhooks")
    public ResponseEntity<WebhookResponse> create(@Valid @RequestBody WebhookRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(webhookService.create(request));
    }

    @PutMapping("/api/webhooks/{id}")
    public WebhookResponse update(@PathVariable UUID id, @Valid @RequestBody WebhookRequest request) {
        return webhookService.update(id, request);
    }

    @DeleteMapping("/api/webhooks/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        webhookService.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/api/webhooks/{id}/status")
    public WebhookResponse toggleStatus(
            @PathVariable UUID id,
            @RequestBody Map<String, Boolean> body) {
        boolean enabled = body.getOrDefault("enabled", false);
        return webhookService.toggleEnabled(id, enabled);
    }

    // ── Response Rules ──────────────────────────────────────────────────

    @PutMapping("/api/webhooks/{id}/response-rules")
    public WebhookResponse updateResponseRules(
            @PathVariable UUID id,
            @Valid @RequestBody List<WebhookResponseRuleDto> rules) {
        return webhookService.updateResponseRules(id, rules);
    }

    // ── Webhook URL ──────────────────────────────────────────────────────

    @GetMapping("/api/webhooks/{id}/url")
    public Map<String, String> getWebhookUrl(@PathVariable UUID id, HttpServletRequest request) {
        // Verify webhook exists
        webhookService.findById(id);
        String baseUrl = getBaseUrl(request);
        return Map.of("url", baseUrl + "/webhook/" + id);
    }

    // ── Request Logs ─────────────────────────────────────────────────────

    @GetMapping("/api/webhooks/{id}/requests")
    public PageResponse<WebhookRequestLogResponse> getRequests(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        if (size < 1) size = 20;
        if (size > 100) size = 100;
        if (page < 0) page = 0;
        return webhookService.getLogs(id, PageRequest.of(page, size, Sort.by("createdAt").descending()));
    }

    @DeleteMapping("/api/webhooks/{id}/requests")
    public ResponseEntity<Void> clearRequests(@PathVariable UUID id) {
        webhookService.clearLogs(id);
        return ResponseEntity.noContent().build();
    }

    // ── SSE Stream ───────────────────────────────────────────────────────

    @GetMapping(value = "/api/webhooks/{id}/requests/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamRequests(@PathVariable UUID id) {
        return webhookHandlerService.registerListener(id);
    }

    // ── Catch-all Webhook Handler ────────────────────────────────────────

    @RequestMapping("/webhook/{id}/**")
    public ResponseEntity<String> handleWebhookRequest(
            @PathVariable UUID id,
            HttpServletRequest request) {
        String fullPath = request.getRequestURI();
        String prefix = "/webhook/" + id;
        int idx = fullPath.indexOf(prefix);
        String path = idx >= 0 ? fullPath.substring(idx + prefix.length()) : "/";
        if (path.isEmpty()) path = "/";
        return webhookHandlerService.handleRequest(id, path, request);
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private String getBaseUrl(HttpServletRequest request) {
        String scheme = request.getScheme();
        String host = request.getServerName();
        int port = request.getServerPort();
        String contextPath = request.getContextPath();
        String base;
        if ((scheme.equals("http") && port == 80) || (scheme.equals("https") && port == 443)) {
            base = scheme + "://" + host;
        } else {
            base = scheme + "://" + host + ":" + port;
        }
        return contextPath.isEmpty() || contextPath.equals("/") ? base : base + contextPath;
    }
}
