package com.orchestrator.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestrator.dto.*;
import com.orchestrator.exception.NotFoundException;
import com.orchestrator.model.MockEndpoint;
import com.orchestrator.model.MockMatchRule;
import com.orchestrator.model.MockServer;
import com.orchestrator.model.enums.MockMatchRuleType;
import com.orchestrator.repository.MockEndpointRepository;
import com.orchestrator.repository.MockRequestLogRepository;
import com.orchestrator.repository.MockServerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class MockEndpointService {

    private final MockEndpointRepository endpointRepository;
    private final MockRequestLogRepository logRepository;
    private final MockServerRepository serverRepository;
    private final ObjectMapper objectMapper;

    // ── Mock Server CRUD ────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PageResponse<MockServerResponse> findAllServers(String name, String description, Pageable pageable) {
        Specification<MockServer> spec = Specification.where(null);

        if (name != null && !name.isBlank()) {
            spec = spec.and((root, query, cb) ->
                    cb.like(cb.lower(root.get("name")), "%" + name.toLowerCase() + "%"));
        }
        if (description != null && !description.isBlank()) {
            spec = spec.and((root, query, cb) ->
                    cb.like(cb.lower(root.get("description")), "%" + description.toLowerCase() + "%"));
        }

        Page<MockServer> page = serverRepository.findAll(spec, pageable);
        return PageResponse.from(page, server -> {
            long count = endpointRepository.countByMockServerId(server.getId());
            return MockServerResponse.fromWithCount(server, count);
        });
    }

    @Transactional(readOnly = true)
    public MockServerResponse findServerById(UUID serverId) {
        MockServer server = serverRepository.findById(serverId)
                .orElseThrow(() -> new NotFoundException("Mock server not found: " + serverId));
        long count = endpointRepository.countByMockServerId(serverId);
        return MockServerResponse.fromWithCount(server, count);
    }

    @Transactional
    public MockServerResponse createServer(MockServerRequest request) {
        if (serverRepository.existsByName(request.getName())) {
            throw new IllegalArgumentException("Mock server with name '" + request.getName() + "' already exists");
        }

        MockServer server = MockServer.builder()
                .name(request.getName())
                .description(request.getDescription())
                .build();
        server = serverRepository.save(server);
        return MockServerResponse.from(server);
    }

    @Transactional
    public MockServerResponse updateServer(UUID serverId, MockServerRequest request) {
        MockServer server = serverRepository.findById(serverId)
                .orElseThrow(() -> new NotFoundException("Mock server not found: " + serverId));

        if (serverRepository.existsByNameAndIdNot(request.getName(), serverId)) {
            throw new IllegalArgumentException("Mock server with name '" + request.getName() + "' already exists");
        }

        server.setName(request.getName());
        server.setDescription(request.getDescription());
        server = serverRepository.save(server);
        long count = endpointRepository.countByMockServerId(serverId);
        return MockServerResponse.fromWithCount(server, count);
    }

    @Transactional
    public void deleteServer(UUID serverId) {
        MockServer server = serverRepository.findById(serverId)
                .orElseThrow(() -> new NotFoundException("Mock server not found: " + serverId));
        server.setDeletedAt(LocalDateTime.now());
        serverRepository.save(server);
    }

    @Transactional
    public MockServerResponse toggleServerStatus(UUID serverId, boolean enabled) {
        MockServer server = serverRepository.findById(serverId)
                .orElseThrow(() -> new NotFoundException("Mock server not found: " + serverId));
        server.setEnabled(enabled);
        serverRepository.save(server);
        long count = endpointRepository.countByMockServerId(serverId);
        return MockServerResponse.fromWithCount(server, count);
    }

    // ── Endpoint CRUD ───────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<MockEndpointResponse> findAllEndpoints(UUID serverId) {
        return endpointRepository.findByMockServerIdWithRules(serverId).stream()
                .map(MockEndpointResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public MockEndpointResponse findEndpointById(UUID id) {
        MockEndpoint ep = endpointRepository.findByIdWithRules(id)
                .orElseThrow(() -> new NotFoundException("Mock endpoint not found: " + id));
        return MockEndpointResponse.from(ep);
    }

    @Transactional
    public MockEndpointResponse createEndpoint(UUID serverId, MockEndpointRequest request) {
        MockServer server = serverRepository.findById(serverId)
                .orElseThrow(() -> new NotFoundException("Mock server not found: " + serverId));

        MockEndpoint ep = MockEndpoint.builder()
                .mockServer(server)
                .name(request.getName())
                .description(request.getDescription())
                .httpMethod(request.getHttpMethod().toUpperCase())
                .pathPattern(request.getPathPattern())
                .responseStatus(request.getResponseStatus())
                .responseBody(request.getResponseBody())
                .responseHeaders(serializeHeaders(request.getResponseHeaders()))
                .delayMs(request.getDelayMs())
                .enabled(request.isEnabled())
                .sortOrder((int) endpointRepository.countByMockServerId(serverId))
                .build();

        applyMatchRules(ep, request.getMatchRules());
        ep = endpointRepository.save(ep);
        return MockEndpointResponse.from(ep);
    }

    @Transactional
    public MockEndpointResponse updateEndpoint(UUID id, MockEndpointRequest request) {
        MockEndpoint ep = endpointRepository.findByIdWithRules(id)
                .orElseThrow(() -> new NotFoundException("Mock endpoint not found: " + id));

        ep.setName(request.getName());
        ep.setDescription(request.getDescription());
        ep.setHttpMethod(request.getHttpMethod().toUpperCase());
        ep.setPathPattern(request.getPathPattern());
        ep.setResponseStatus(request.getResponseStatus());
        ep.setResponseBody(request.getResponseBody());
        ep.setResponseHeaders(serializeHeaders(request.getResponseHeaders()));
        ep.setDelayMs(request.getDelayMs());
        ep.setEnabled(request.isEnabled());

        ep.getMatchRules().clear();
        endpointRepository.saveAndFlush(ep);
        applyMatchRules(ep, request.getMatchRules());

        ep = endpointRepository.save(ep);
        return MockEndpointResponse.from(ep);
    }

    @Transactional
    public void deleteEndpoint(UUID id) {
        MockEndpoint ep = endpointRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Mock endpoint not found: " + id));
        endpointRepository.delete(ep);
    }

    @Transactional
    public List<MockEndpointResponse> reorderEndpoints(UUID serverId, List<UUID> endpointIds) {
        List<MockEndpoint> endpoints = endpointRepository.findByMockServerIdWithRules(serverId);

        Map<UUID, MockEndpoint> byId = endpoints.stream()
                .collect(Collectors.toMap(MockEndpoint::getId, e -> e));

        AtomicInteger order = new AtomicInteger(0);
        for (UUID epId : endpointIds) {
            MockEndpoint ep = byId.get(epId);
            if (ep != null) {
                ep.setSortOrder(order.getAndIncrement());
            }
        }

        endpointRepository.saveAll(endpoints);
        return endpointRepository.findByMockServerIdWithRules(serverId).stream()
                .map(MockEndpointResponse::from)
                .toList();
    }

    // ── Status info ─────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public MockServerStatusResponse getStatus(UUID serverId, String baseUrl) {
        MockServer server = serverRepository.findById(serverId)
                .orElseThrow(() -> new NotFoundException("Mock server not found: " + serverId));

        long total = endpointRepository.countByMockServerId(serverId);
        long enabled = endpointRepository.findByMockServerIdAndEnabledTrueWithRules(serverId).size();

        return MockServerStatusResponse.builder()
                .enabled(server.isEnabled())
                .mockUrl(baseUrl + "/mock/" + serverId)
                .endpointCount(total)
                .enabledEndpointCount(enabled)
                .build();
    }

    // ── Request logs ────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PageResponse<MockRequestLogResponse> getLogs(UUID serverId, Pageable pageable) {
        return PageResponse.from(
                logRepository.findByMockServerId(serverId, pageable),
                MockRequestLogResponse::from);
    }

    @Transactional
    public void clearLogs(UUID serverId) {
        logRepository.deleteByMockServerId(serverId);
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    private void applyMatchRules(MockEndpoint ep, List<MockMatchRuleDto> dtos) {
        AtomicInteger order = new AtomicInteger(0);
        for (MockMatchRuleDto dto : dtos) {
            MockMatchRule rule = MockMatchRule.builder()
                    .endpoint(ep)
                    .ruleType(MockMatchRuleType.valueOf(dto.getRuleType()))
                    .matchKey(dto.getMatchKey())
                    .matchValue(dto.getMatchValue())
                    .sortOrder(order.getAndIncrement())
                    .build();
            ep.getMatchRules().add(rule);
        }
    }

    private String serializeHeaders(List<KeyValuePair> headers) {
        try {
            return objectMapper.writeValueAsString(headers != null ? headers : List.of());
        } catch (Exception e) {
            return "[]";
        }
    }
}
