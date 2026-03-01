package com.orchestrator.dto;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestrator.model.Webhook;
import com.orchestrator.model.WebhookResponseRule;
import com.orchestrator.model.WebhookRuleCondition;
import lombok.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
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
    private List<WebhookResponseRuleDto> responseRules;
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
                .responseRules(mapRules(webhook))
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
                .responseRules(mapRules(webhook))
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

    private static List<WebhookResponseRuleDto> mapRules(Webhook webhook) {
        if (webhook.getResponseRules() == null) return List.of();
        return webhook.getResponseRules().stream()
                .sorted(Comparator.comparingInt(WebhookResponseRule::getSortOrder))
                .map(rule -> WebhookResponseRuleDto.builder()
                        .id(rule.getId())
                        .name(rule.getName())
                        .enabled(rule.isEnabled())
                        .responseStatus(rule.getResponseStatus())
                        .responseBody(rule.getResponseBody())
                        .responseHeaders(parseHeaders(rule.getResponseHeaders()))
                        .conditions(rule.getConditions() == null ? List.of()
                                : rule.getConditions().stream()
                                .sorted(Comparator.comparingInt(WebhookRuleCondition::getSortOrder))
                                .map(c -> WebhookRuleConditionDto.builder()
                                        .id(c.getId())
                                        .conditionType(c.getConditionType())
                                        .matchKey(c.getMatchKey())
                                        .matchValue(c.getMatchValue())
                                        .build())
                                .toList())
                        .build())
                .toList();
    }
}
