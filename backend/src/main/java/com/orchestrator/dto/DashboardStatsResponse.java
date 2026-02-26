package com.orchestrator.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DashboardStatsResponse {
    private long totalRuns;
    private long successCount;
    private long failureCount;
    private long partialFailureCount;
    private long cancelledCount;
    private long runningCount;
    private long activeSchedules;
    private long totalSuites;
    private long totalEnvironments;
}
