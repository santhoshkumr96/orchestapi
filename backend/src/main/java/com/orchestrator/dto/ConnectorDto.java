package com.orchestrator.dto;

import com.orchestrator.model.enums.ConnectorType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.*;

import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ConnectorDto {

    private UUID id;

    @NotBlank(message = "Connector name is required")
    @Size(max = 100)
    private String name;

    @NotNull(message = "Connector type is required")
    private ConnectorType type;

    @NotNull
    @Builder.Default
    private Map<String, String> config = Map.of();
}
