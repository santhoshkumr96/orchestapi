package com.orchestrator.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestrator.model.Webhook;
import com.orchestrator.model.WebhookRequestLog;
import com.orchestrator.repository.WebhookRepository;
import com.orchestrator.repository.WebhookRequestLogRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
@RequiredArgsConstructor
@Slf4j
public class WebhookHandlerService {

    private static final long SSE_TIMEOUT = 3_600_000L; // 60 minutes
    private static final int MAX_LOGS = 500;
    private static final long MAX_CONTENT_LENGTH = 10 * 1024 * 1024; // 10MB

    private final WebhookRepository webhookRepository;
    private final WebhookRequestLogRepository logRepository;
    private final ObjectMapper objectMapper;

    private final ConcurrentHashMap<UUID, CopyOnWriteArrayList<SseEmitter>> sseListeners = new ConcurrentHashMap<>();

    // ── SSE Registration ─────────────────────────────────────────────────

    public SseEmitter registerListener(UUID webhookId) {
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT);

        sseListeners.computeIfAbsent(webhookId, k -> new CopyOnWriteArrayList<>()).add(emitter);

        Runnable cleanup = () -> {
            CopyOnWriteArrayList<SseEmitter> list = sseListeners.get(webhookId);
            if (list != null) {
                list.remove(emitter);
                if (list.isEmpty()) {
                    sseListeners.remove(webhookId);
                }
            }
        };

        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(t -> cleanup.run());

        // Send connected event
        try {
            emitter.send(SseEmitter.event()
                    .name("connected")
                    .data(Map.of("webhookId", webhookId.toString()), MediaType.APPLICATION_JSON));
        } catch (IOException e) {
            log.warn("Failed to send connected event for webhook {}", webhookId);
        }

        return emitter;
    }

    // ── Request Handler ──────────────────────────────────────────────────

    @Transactional
    public ResponseEntity<String> handleRequest(UUID webhookId, String path, HttpServletRequest request) {
        // Validate webhook exists and is enabled
        Webhook webhook = webhookRepository.findById(webhookId).orElse(null);
        if (webhook == null) {
            return ResponseEntity.status(404)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("{\"error\":\"Webhook not found\"}");
        }
        if (!webhook.isEnabled()) {
            return ResponseEntity.status(503)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("{\"error\":\"Webhook is disabled\"}");
        }

        // Check content length
        long contentLength = request.getContentLengthLong();
        if (contentLength > MAX_CONTENT_LENGTH) {
            return ResponseEntity.status(413)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("{\"error\":\"Request body exceeds 10MB limit\"}");
        }

        String method = request.getMethod();
        Map<String, String> headers = extractHeaders(request);
        Map<String, String> queryParams = extractQueryParams(request);
        String contentType = request.getContentType();
        String sourceIp = getSourceIp(request);

        boolean isMultipart = contentType != null && contentType.toLowerCase().startsWith("multipart/");
        String body = null;
        String filesJson = null;

        if (isMultipart && request instanceof MultipartHttpServletRequest multipartRequest) {
            // Handle multipart
            List<Map<String, Object>> fileEntries = new ArrayList<>();
            Iterator<String> fileNames = multipartRequest.getFileNames();
            while (fileNames.hasNext()) {
                String paramName = fileNames.next();
                for (MultipartFile file : multipartRequest.getFiles(paramName)) {
                    try {
                        Map<String, Object> entry = new LinkedHashMap<>();
                        entry.put("filename", file.getOriginalFilename());
                        entry.put("contentType", file.getContentType());
                        entry.put("size", file.getSize());
                        entry.put("contentBase64", Base64.getEncoder().encodeToString(file.getBytes()));
                        fileEntries.add(entry);
                    } catch (IOException e) {
                        log.warn("Failed to read multipart file: {}", file.getOriginalFilename());
                    }
                }
            }
            try {
                filesJson = objectMapper.writeValueAsString(fileEntries);
            } catch (Exception e) {
                filesJson = "[]";
            }
        } else if (isBinaryContentType(contentType)) {
            // Binary content → base64
            try {
                byte[] bytes = request.getInputStream().readAllBytes();
                body = Base64.getEncoder().encodeToString(bytes);
            } catch (IOException e) {
                log.warn("Failed to read binary request body");
            }
        } else {
            // Text/JSON
            try {
                byte[] bytes = request.getInputStream().readAllBytes();
                body = new String(bytes);
            } catch (IOException e) {
                log.warn("Failed to read request body");
            }
        }

        // Build configured response
        HttpHeaders responseHeaders = new HttpHeaders();
        parseResponseHeaders(webhook.getDefaultResponseHeaders(), responseHeaders);
        if (!responseHeaders.containsKey(HttpHeaders.CONTENT_TYPE)) {
            responseHeaders.setContentType(MediaType.APPLICATION_JSON);
        }

        String responseBody = webhook.getDefaultResponseBody();
        int responseStatus = webhook.getDefaultResponseStatus();

        // Save log
        WebhookRequestLog logEntry = WebhookRequestLog.builder()
                .webhookId(webhookId)
                .httpMethod(method)
                .requestPath(path)
                .requestHeaders(toJson(headers))
                .requestBody(body)
                .queryParams(toJson(queryParams))
                .contentType(contentType)
                .contentLength(contentLength >= 0 ? contentLength : null)
                .sourceIp(sourceIp)
                .multipart(isMultipart)
                .files(filesJson)
                .responseStatus(responseStatus)
                .responseBody(responseBody)
                .build();

        logEntry = logRepository.save(logEntry);

        // Auto-trim if over limit
        long count = logRepository.countByWebhookId(webhookId);
        if (count > MAX_LOGS) {
            logRepository.trimOldLogs(webhookId, MAX_LOGS);
        }

        // Push to SSE listeners
        pushToListeners(webhookId, logEntry);

        return ResponseEntity.status(responseStatus)
                .headers(responseHeaders)
                .body(responseBody);
    }

    // ── SSE Push ─────────────────────────────────────────────────────────

    private void pushToListeners(UUID webhookId, WebhookRequestLog logEntry) {
        CopyOnWriteArrayList<SseEmitter> listeners = sseListeners.get(webhookId);
        if (listeners == null || listeners.isEmpty()) return;

        try {
            String data = objectMapper.writeValueAsString(
                    com.orchestrator.dto.WebhookRequestLogResponse.from(logEntry));

            for (SseEmitter emitter : listeners) {
                try {
                    emitter.send(SseEmitter.event()
                            .name("request")
                            .data(data, MediaType.APPLICATION_JSON));
                } catch (IOException e) {
                    // Emitter is dead, cleanup will handle removal
                    log.debug("Failed to send SSE event to listener for webhook {}", webhookId);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to serialize webhook request log for SSE", e);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────

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

    private String getSourceIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private boolean isBinaryContentType(String contentType) {
        if (contentType == null) return false;
        String ct = contentType.toLowerCase();
        return ct.startsWith("image/") ||
                ct.startsWith("audio/") ||
                ct.startsWith("video/") ||
                ct.equals("application/octet-stream") ||
                ct.equals("application/pdf");
    }

    private void parseResponseHeaders(String headersJson, HttpHeaders responseHeaders) {
        try {
            var arr = objectMapper.readTree(headersJson != null ? headersJson : "[]");
            if (arr.isArray()) {
                for (var node : arr) {
                    String key = node.has("key") ? node.get("key").asText() : null;
                    String value = node.has("value") ? node.get("value").asText() : "";
                    if (key != null && !key.isBlank()) {
                        responseHeaders.add(key, value);
                    }
                }
            }
        } catch (Exception ignored) {}
    }

    private String toJson(Object obj) {
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            return "{}";
        }
    }
}
