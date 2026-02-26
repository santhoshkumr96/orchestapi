package com.orchestrator.dto;

import lombok.*;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StepDependencyDto {

    private UUID id;
    private UUID dependsOnStepId;
    private String dependsOnStepName;

    @Builder.Default
    private boolean useCache = true;

    @Builder.Default
    private boolean reuseManualInput = true;
}
