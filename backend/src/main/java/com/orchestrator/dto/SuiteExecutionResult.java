package com.orchestrator.dto;

import lombok.*;

import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SuiteExecutionResult {
    private String status; // SUCCESS, PARTIAL_FAILURE, FAILURE
    private List<StepExecutionResult> steps;
    private long totalDurationMs;
}
