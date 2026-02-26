package com.orchestrator.dto;

import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TestRunResponse {
    private String id;
    private String suiteId;
    private String suiteName;
    private String environmentId;
    private String environmentName;
    private String triggerType;
    private String scheduleId;
    private String status;
    private LocalDateTime startedAt;
    private LocalDateTime completedAt;
    private Long totalDurationMs;
    private SuiteExecutionResult resultData;
    private LocalDateTime createdAt;
}
