package com.orchestrator.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.*;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class RunScheduleRequest {

    @NotNull(message = "Suite ID is required")
    private UUID suiteId;

    @NotNull(message = "Environment ID is required")
    private UUID environmentId;

    @NotBlank(message = "Cron expression is required")
    @Size(max = 100)
    private String cronExpression;

    @Size(max = 255)
    private String description;
}
