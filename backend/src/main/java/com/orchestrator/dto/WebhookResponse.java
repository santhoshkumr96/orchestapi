package com.orchestrator.dto;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestrator.model.Webhook;
import lombok.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WebhookResponse {

    private static final ObjectMapper mapper = new ObjectMapper();

    private UUID id;
    private String name;
    private String description;
    private boolean enabled;
    private int defaultResponseStatus;
    private String defaultResponseBody;
    private List<KeyValuePair> defaultResponseHeaders;
    private long requestCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static WebhookResponse from(Webhook webhook) {
        return WebhookResponse.builder()
                .id(webhook.getId())
                .name(webhook.getName())
                .description(webhook.getDescription())
                .enabled(webhook.isEnabled())
                .defaultResponseStatus(webhook.getDefaultResponseStatus())
                .defaultResponseBody(webhook.getDefaultResponseBody())
                .defaultResponseHeaders(parseHeaders(webhook.getDefaultResponseHeaders()))
                .createdAt(webhook.getCreatedAt())
                .updatedAt(webhook.getUpdatedAt())
                .build();
    }

    public static WebhookResponse fromWithCount(Webhook webhook, long requestCount) {
        return WebhookResponse.builder()
                .id(webhook.getId())
                .name(webhook.getName())
                .description(webhook.getDescription())
                .enabled(webhook.isEnabled())
                .defaultResponseStatus(webhook.getDefaultResponseStatus())
                .defaultResponseBody(webhook.getDefaultResponseBody())
                .defaultResponseHeaders(parseHeaders(webhook.getDefaultResponseHeaders()))
                .requestCount(requestCount)
                .createdAt(webhook.getCreatedAt())
                .updatedAt(webhook.getUpdatedAt())
                .build();
    }

    private static List<KeyValuePair> parseHeaders(String json) {
        try {
            return mapper.readValue(json != null ? json : "[]", new TypeReference<>() {});
        } catch (Exception e) {
            return List.of();
        }
    }
}
