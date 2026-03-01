package com.orchestrator.dto;

import com.orchestrator.model.MockServer;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MockServerResponse {

    private UUID id;
    private String name;
    private String description;
    private boolean enabled;
    private long endpointCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static MockServerResponse from(MockServer server) {
        return MockServerResponse.builder()
                .id(server.getId())
                .name(server.getName())
                .description(server.getDescription())
                .enabled(server.isEnabled())
                .endpointCount(server.getEndpoints() != null ? server.getEndpoints().size() : 0)
                .createdAt(server.getCreatedAt())
                .updatedAt(server.getUpdatedAt())
                .build();
    }

    public static MockServerResponse fromWithCount(MockServer server, long endpointCount) {
        return MockServerResponse.builder()
                .id(server.getId())
                .name(server.getName())
                .description(server.getDescription())
                .enabled(server.isEnabled())
                .endpointCount(endpointCount)
                .createdAt(server.getCreatedAt())
                .updatedAt(server.getUpdatedAt())
                .build();
    }
}
