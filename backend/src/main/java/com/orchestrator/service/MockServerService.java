package com.orchestrator.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestrator.model.MockEndpoint;
import com.orchestrator.model.MockMatchRule;
import com.orchestrator.model.MockRequestLog;
import com.orchestrator.model.MockServer;
import com.orchestrator.repository.MockEndpointRepository;
import com.orchestrator.repository.MockRequestLogRepository;
import com.orchestrator.repository.MockServerRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.BufferedReader;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class MockServerService {

    private final MockEndpointRepository endpointRepository;
    private final MockRequestLogRepository logRepository;
    private final MockServerRepository serverRepository;
    private final ObjectMapper objectMapper;

    @Transactional
    public ResponseEntity<String> handleRequest(UUID serverId, String path, HttpServletRequest request) {
        long startTime = System.currentTimeMillis();

        // Check mock server exists and is enabled
        MockServer server = serverRepository.findById(serverId).orElse(null);
        if (server == null) {
            return ResponseEntity.status(404)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("{\"error\":\"Mock server not found\"}");
        }
        if (!server.isEnabled()) {
            return ResponseEntity.status(503)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("{\"error\":\"Mock server is disabled\"}");
        }

        String method = request.getMethod();
        String body = readBody(request);
        Map<String, String> headers = extractHeaders(request);
        Map<String, String> queryParams = extractQueryParams(request);

        // Load enabled endpoints ordered by sortOrder
        List<MockEndpoint> endpoints = endpointRepository.findByMockServerIdAndEnabledTrueWithRules(serverId);

        // Find first matching endpoint
        MockEndpoint matched = null;
        for (MockEndpoint ep : endpoints) {
            if (matches(ep, method, path, headers, queryParams, body)) {
                matched = ep;
                break;
            }
        }

        ResponseEntity<String> response;
        if (matched != null) {
            // Apply delay
            if (matched.getDelayMs() > 0) {
                try {
                    Thread.sleep(matched.getDelayMs());
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }

            // Build response
            HttpHeaders responseHeaders = new HttpHeaders();
            parseResponseHeaders(matched.getResponseHeaders(), responseHeaders);
            if (!responseHeaders.containsKey(HttpHeaders.CONTENT_TYPE)) {
                responseHeaders.setContentType(MediaType.APPLICATION_JSON);
            }

            response = ResponseEntity.status(matched.getResponseStatus())
                    .headers(responseHeaders)
                    .body(matched.getResponseBody());
        } else {
            response = ResponseEntity.status(404)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("{\"error\":\"No matching mock endpoint\"}");
        }

        long duration = System.currentTimeMillis() - startTime;
        saveLog(serverId, matched, method, path, headers, body, queryParams, response, duration);

        return response;
    }

    // ── Matching Logic ──────────────────────────────────────────────────

    private boolean matches(MockEndpoint ep, String method, String path,
                            Map<String, String> headers, Map<String, String> queryParams, String body) {
        if (!ep.getHttpMethod().equals("ANY") && !ep.getHttpMethod().equalsIgnoreCase(method)) {
            return false;
        }
        if (!matchesPath(ep.getPathPattern(), path)) {
            return false;
        }
        for (MockMatchRule rule : ep.getMatchRules()) {
            if (!matchesRule(rule, headers, queryParams, body)) {
                return false;
            }
        }
        return true;
    }

    private boolean matchesPath(String pattern, String requestPath) {
        String normalizedPattern = pattern.replaceAll("^/+|/+$", "");
        String normalizedPath = requestPath.replaceAll("^/+|/+$", "");

        // Wildcard: /api/** matches anything under /api/
        if (normalizedPattern.endsWith("/**")) {
            String prefix = normalizedPattern.substring(0, normalizedPattern.length() - 3);
            return normalizedPath.equals(prefix) || normalizedPath.startsWith(prefix + "/");
        }

        String[] patternParts = normalizedPattern.split("/");
        String[] pathParts = normalizedPath.split("/");

        if (patternParts.length != pathParts.length) {
            return false;
        }

        for (int i = 0; i < patternParts.length; i++) {
            String pp = patternParts[i];
            if (pp.startsWith(":")) continue; // parameterized segment
            if (!pp.equalsIgnoreCase(pathParts[i])) return false;
        }
        return true;
    }

    private boolean matchesRule(MockMatchRule rule, Map<String, String> headers,
                                Map<String, String> queryParams, String body) {
        return switch (rule.getRuleType()) {
            case HEADER -> {
                String headerVal = headers.get(rule.getMatchKey().toLowerCase());
                if (headerVal == null) yield false;
                yield rule.getMatchValue() == null || rule.getMatchValue().equals(headerVal);
            }
            case QUERY_PARAM -> {
                String paramVal = queryParams.get(rule.getMatchKey());
                if (paramVal == null) yield false;
                yield rule.getMatchValue() == null || rule.getMatchValue().equals(paramVal);
            }
            case BODY_JSON_PATH -> {
                if (body == null || body.isBlank()) yield false;
                yield matchesJsonPath(body, rule.getMatchKey(), rule.getMatchValue());
            }
        };
    }

    private boolean matchesJsonPath(String body, String jsonPath, String expectedValue) {
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode node = navigateJsonPath(root, jsonPath);
            if (node == null || node.isMissingNode()) return false;
            if (expectedValue == null) return true;
            return node.asText().equals(expectedValue);
        } catch (Exception e) {
            return false;
        }
    }

    private JsonNode navigateJsonPath(JsonNode root, String path) {
        String normalized = path.startsWith("$.") ? path.substring(2) : path;
        JsonNode current = root;
        for (String segment : normalized.split("\\.")) {
            if (current == null || current.isMissingNode()) return null;
            if (segment.contains("[")) {
                int bracketIdx = segment.indexOf('[');
                String fieldName = segment.substring(0, bracketIdx);
                int arrIdx = Integer.parseInt(segment.substring(bracketIdx + 1, segment.indexOf(']')));
                current = current.get(fieldName);
                if (current != null && current.isArray()) {
                    current = current.get(arrIdx);
                } else {
                    return null;
                }
            } else {
                current = current.get(segment);
            }
        }
        return current;
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    private String readBody(HttpServletRequest request) {
        try (BufferedReader reader = request.getReader()) {
            return reader.lines().collect(Collectors.joining("\n"));
        } catch (Exception e) {
            return null;
        }
    }

    private Map<String, String> extractHeaders(HttpServletRequest request) {
        Map<String, String> headers = new LinkedHashMap<>();
        Enumeration<String> names = request.getHeaderNames();
        while (names.hasMoreElements()) {
            String name = names.nextElement();
            headers.put(name.toLowerCase(), request.getHeader(name));
        }
        return headers;
    }

    private Map<String, String> extractQueryParams(HttpServletRequest request) {
        Map<String, String> params = new LinkedHashMap<>();
        request.getParameterMap().forEach((key, values) -> {
            if (values.length > 0) {
                params.put(key, values[0]);
            }
        });
        return params;
    }

    private void parseResponseHeaders(String headersJson, HttpHeaders responseHeaders) {
        try {
            JsonNode arr = objectMapper.readTree(headersJson != null ? headersJson : "[]");
            if (arr.isArray()) {
                for (JsonNode node : arr) {
                    String key = node.has("key") ? node.get("key").asText() : null;
                    String value = node.has("value") ? node.get("value").asText() : "";
                    if (key != null && !key.isBlank()) {
                        responseHeaders.add(key, value);
                    }
                }
            }
        } catch (Exception ignored) {}
    }

    private void saveLog(UUID serverId, MockEndpoint matched, String method, String path,
                         Map<String, String> headers, String body, Map<String, String> queryParams,
                         ResponseEntity<String> response, long duration) {
        try {
            MockRequestLog logEntry = MockRequestLog.builder()
                    .mockServerId(serverId)
                    .matchedEndpointId(matched != null ? matched.getId() : null)
                    .httpMethod(method)
                    .requestPath(path)
                    .requestHeaders(objectMapper.writeValueAsString(headers))
                    .requestBody(body)
                    .queryParams(objectMapper.writeValueAsString(queryParams))
                    .responseStatus(response.getStatusCode().value())
                    .responseBody(response.getBody())
                    .matched(matched != null)
                    .durationMs((int) duration)
                    .build();
            logRepository.save(logEntry);
        } catch (Exception e) {
            log.warn("Failed to save mock request log", e);
        }
    }
}
