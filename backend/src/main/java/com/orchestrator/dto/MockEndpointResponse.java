package com.orchestrator.dto;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestrator.model.MockEndpoint;
import lombok.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MockEndpointResponse {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private UUID id;
    private String name;
    private String description;
    private String httpMethod;
    private String pathPattern;
    private int responseStatus;
    private String responseBody;
    private List<KeyValuePair> responseHeaders;
    private int delayMs;
    private boolean enabled;
    private int sortOrder;
    private List<MockMatchRuleDto> matchRules;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static MockEndpointResponse from(MockEndpoint ep) {
        List<KeyValuePair> headers = List.of();
        try {
            headers = MAPPER.readValue(
                    ep.getResponseHeaders() != null ? ep.getResponseHeaders() : "[]",
                    new TypeReference<List<KeyValuePair>>() {});
        } catch (Exception ignored) {}

        List<MockMatchRuleDto> rules = ep.getMatchRules().stream()
                .map(MockMatchRuleDto::from)
                .toList();

        return MockEndpointResponse.builder()
                .id(ep.getId())
                .name(ep.getName())
                .description(ep.getDescription())
                .httpMethod(ep.getHttpMethod())
                .pathPattern(ep.getPathPattern())
                .responseStatus(ep.getResponseStatus())
                .responseBody(ep.getResponseBody())
                .responseHeaders(headers)
                .delayMs(ep.getDelayMs())
                .enabled(ep.isEnabled())
                .sortOrder(ep.getSortOrder())
                .matchRules(rules)
                .createdAt(ep.getCreatedAt())
                .updatedAt(ep.getUpdatedAt())
                .build();
    }
}
