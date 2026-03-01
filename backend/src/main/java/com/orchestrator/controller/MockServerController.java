package com.orchestrator.controller;

import com.orchestrator.dto.*;
import com.orchestrator.service.MockEndpointService;
import com.orchestrator.service.MockServerService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class MockServerController {

    private static final Set<String> ALLOWED_SORT_FIELDS = Set.of("name", "createdAt", "updatedAt");
    private static final int MAX_PAGE_SIZE = 100;

    private final MockEndpointService endpointService;
    private final MockServerService mockServerService;

    // ── Mock Server CRUD ────────────────────────────────────────────────

    @GetMapping("/api/mock-servers")
    public PageResponse<MockServerResponse> listServers(
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
        return endpointService.findAllServers(name, description, PageRequest.of(page, size, sort));
    }

    @GetMapping("/api/mock-servers/{id}")
    public MockServerResponse getServer(@PathVariable UUID id) {
        return endpointService.findServerById(id);
    }

    @PostMapping("/api/mock-servers")
    public ResponseEntity<MockServerResponse> createServer(@Valid @RequestBody MockServerRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(endpointService.createServer(request));
    }

    @PutMapping("/api/mock-servers/{id}")
    public MockServerResponse updateServer(@PathVariable UUID id, @Valid @RequestBody MockServerRequest request) {
        return endpointService.updateServer(id, request);
    }

    @DeleteMapping("/api/mock-servers/{id}")
    public ResponseEntity<Void> deleteServer(@PathVariable UUID id) {
        endpointService.deleteServer(id);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/api/mock-servers/{id}/status")
    public MockServerResponse toggleStatus(
            @PathVariable UUID id,
            @RequestBody Map<String, Boolean> body) {
        boolean enabled = body.getOrDefault("enabled", false);
        return endpointService.toggleServerStatus(id, enabled);
    }

    // ── Endpoint CRUD ───────────────────────────────────────────────────

    @GetMapping("/api/mock-servers/{serverId}/endpoints")
    public List<MockEndpointResponse> listEndpoints(@PathVariable UUID serverId) {
        return endpointService.findAllEndpoints(serverId);
    }

    @GetMapping("/api/mock-servers/{serverId}/endpoints/{id}")
    public MockEndpointResponse getEndpoint(@PathVariable UUID serverId, @PathVariable UUID id) {
        return endpointService.findEndpointById(id);
    }

    @PostMapping("/api/mock-servers/{serverId}/endpoints")
    public ResponseEntity<MockEndpointResponse> createEndpoint(
            @PathVariable UUID serverId,
            @Valid @RequestBody MockEndpointRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(endpointService.createEndpoint(serverId, request));
    }

    @PutMapping("/api/mock-servers/{serverId}/endpoints/{id}")
    public MockEndpointResponse updateEndpoint(
            @PathVariable UUID serverId,
            @PathVariable UUID id,
            @Valid @RequestBody MockEndpointRequest request) {
        return endpointService.updateEndpoint(id, request);
    }

    @DeleteMapping("/api/mock-servers/{serverId}/endpoints/{id}")
    public ResponseEntity<Void> deleteEndpoint(@PathVariable UUID serverId, @PathVariable UUID id) {
        endpointService.deleteEndpoint(id);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/api/mock-servers/{serverId}/endpoints/reorder")
    public List<MockEndpointResponse> reorderEndpoints(
            @PathVariable UUID serverId,
            @Valid @RequestBody ReorderRequest request) {
        return endpointService.reorderEndpoints(serverId, request.getStepIds());
    }

    // ── Status Info ─────────────────────────────────────────────────────

    @GetMapping("/api/mock-servers/{serverId}/status")
    public MockServerStatusResponse getServerStatus(
            @PathVariable UUID serverId,
            HttpServletRequest request) {
        return endpointService.getStatus(serverId, getBaseUrl(request));
    }

    // ── Request Logs ────────────────────────────────────────────────────

    @GetMapping("/api/mock-servers/{serverId}/logs")
    public PageResponse<MockRequestLogResponse> getLogs(
            @PathVariable UUID serverId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        if (size < 1) size = 20;
        if (size > 100) size = 100;
        if (page < 0) page = 0;
        return endpointService.getLogs(serverId, PageRequest.of(page, size, Sort.by("createdAt").descending()));
    }

    @DeleteMapping("/api/mock-servers/{serverId}/logs")
    public ResponseEntity<Void> clearLogs(@PathVariable UUID serverId) {
        endpointService.clearLogs(serverId);
        return ResponseEntity.noContent().build();
    }

    // ── Catch-all Mock Handler ──────────────────────────────────────────

    @RequestMapping("/mock/{serverId}/**")
    public ResponseEntity<String> handleMockRequest(
            @PathVariable UUID serverId,
            HttpServletRequest request) {
        String fullPath = request.getRequestURI();
        String prefix = "/mock/" + serverId;
        String path = fullPath.substring(fullPath.indexOf(prefix) + prefix.length());
        if (path.isEmpty()) path = "/";
        return mockServerService.handleRequest(serverId, path, request);
    }

    // ── Helpers ─────────────────────────────────────────────────────────

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
