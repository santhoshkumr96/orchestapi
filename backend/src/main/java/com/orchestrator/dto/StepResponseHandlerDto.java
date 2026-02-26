package com.orchestrator.dto;

import com.orchestrator.model.ResponseAction;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StepResponseHandlerDto {

    private UUID id;

    @NotBlank(message = "Match code is required")
    private String matchCode;

    @NotNull(message = "Action is required")
    @Builder.Default
    private ResponseAction action = ResponseAction.ERROR;

    private UUID sideEffectStepId;

    @Builder.Default
    private int retryCount = 0;

    @Builder.Default
    private int retryDelaySeconds = 0;

    @Builder.Default
    private int priority = 0;
}
