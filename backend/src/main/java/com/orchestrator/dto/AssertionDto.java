package com.orchestrator.dto;

import com.orchestrator.model.enums.AssertionOperator;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AssertionDto {

    private UUID id;

    @NotBlank(message = "JSON path is required")
    private String jsonPath;

    @NotNull(message = "Operator is required")
    private AssertionOperator operator;

    @Builder.Default
    private String expectedValue = "";
}
