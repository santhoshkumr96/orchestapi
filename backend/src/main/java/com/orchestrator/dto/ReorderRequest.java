package com.orchestrator.dto;

import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.util.List;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ReorderRequest {

    @NotNull(message = "Step IDs are required")
    private List<UUID> stepIds;
}
