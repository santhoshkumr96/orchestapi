package com.orchestrator.dto;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestrator.model.Environment;
import lombok.*;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EnvironmentResponse {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private UUID id;
    private String name;
    private String baseUrl;
    private List<VariableDto> variables;
    private List<HeaderDto> headers;
    private List<ConnectorDto> connectors;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static EnvironmentResponse from(Environment env, boolean maskSecrets) {
        List<VariableDto> vars = env.getVariables().stream()
                .map(v -> VariableDto.builder()
                        .id(v.getId())
                        .key(v.getKey())
                        .value(maskSecrets && v.isSecret() ? "••••••••" : v.getValue())
                        .secret(v.isSecret())
                        .build())
                .toList();

        List<HeaderDto> hdrs = env.getHeaders().stream()
                .map(h -> HeaderDto.builder()
                        .id(h.getId())
                        .headerKey(h.getHeaderKey())
                        .valueType(h.getValueType())
                        .headerValue(h.getHeaderValue())
                        .build())
                .toList();

        List<ConnectorDto> conns = env.getConnectors().stream()
                .map(c -> {
                    Map<String, String> maskedConfig = new LinkedHashMap<>();
                    try {
                        Map<String, String> raw = MAPPER.readValue(c.getConfig(),
                                new TypeReference<Map<String, String>>() {});
                        raw.forEach((k, v) -> {
                            if (k.toLowerCase().contains("password")) {
                                maskedConfig.put(k, "••••••••");
                            } else {
                                maskedConfig.put(k, v);
                            }
                        });
                    } catch (Exception e) { /* skip */ }
                    return ConnectorDto.builder()
                            .id(c.getId())
                            .name(c.getName())
                            .type(c.getType())
                            .config(maskedConfig)
                            .build();
                }).toList();

        return EnvironmentResponse.builder()
                .id(env.getId())
                .name(env.getName())
                .baseUrl(env.getBaseUrl())
                .variables(vars)
                .headers(hdrs)
                .connectors(conns)
                .createdAt(env.getCreatedAt())
                .updatedAt(env.getUpdatedAt())
                .build();
    }
}
