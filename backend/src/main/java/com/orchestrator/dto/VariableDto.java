package com.orchestrator.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.*;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VariableDto {
    private UUID id;

    @NotBlank(message = "Variable key is required")
    @Size(max = 255, message = "Variable key must not exceed 255 characters")
    private String key;

    private String value;

    @Builder.Default
    private String valueType = "STATIC";

    @Builder.Default
    private boolean secret = false;
}
