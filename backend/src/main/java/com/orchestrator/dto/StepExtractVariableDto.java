package com.orchestrator.dto;

import com.orchestrator.model.ExtractionSource;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StepExtractVariableDto {

    private UUID id;

    @NotBlank(message = "Variable name is required")
    private String variableName;

    @NotBlank(message = "JSON path is required")
    private String jsonPath;

    @NotNull(message = "Source is required")
    @Builder.Default
    private ExtractionSource source = ExtractionSource.RESPONSE_BODY;
}
