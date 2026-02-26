package com.orchestrator.dto;

import com.orchestrator.model.enums.ConnectorType;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TestConnectionRequest {
    @NotNull
    private ConnectorType type;
    @NotNull
    private Map<String, String> config;
    private UUID environmentId;
    private String connectorName;
}
