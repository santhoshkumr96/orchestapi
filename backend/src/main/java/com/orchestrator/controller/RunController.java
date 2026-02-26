package com.orchestrator.controller;

import com.orchestrator.dto.DashboardStatsResponse;
import com.orchestrator.dto.PageResponse;
import com.orchestrator.dto.TestRunResponse;
import com.orchestrator.model.enums.RunStatus;
import com.orchestrator.service.RunService;
import com.orchestrator.service.ScheduleService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/runs")
@RequiredArgsConstructor
public class RunController {

    private static final Set<String> ALLOWED_SORT_FIELDS = Set.of(
            "startedAt", "completedAt", "status", "totalDurationMs", "triggerType", "createdAt");
    private static final int MAX_PAGE_SIZE = 100;

    private final RunService runService;
    private final ScheduleService scheduleService;

    @GetMapping("/stats")
    public DashboardStatsResponse getStats() {
        return DashboardStatsResponse.builder()
                .totalRuns(runService.countAll())
                .successCount(runService.countByStatus(RunStatus.SUCCESS))
                .failureCount(runService.countByStatus(RunStatus.FAILURE))
                .partialFailureCount(runService.countByStatus(RunStatus.PARTIAL_FAILURE))
                .cancelledCount(runService.countByStatus(RunStatus.CANCELLED))
                .runningCount(runService.countByStatus(RunStatus.RUNNING))
                .activeSchedules(scheduleService.countActive())
                .build();
    }

    @GetMapping
    public PageResponse<TestRunResponse> findAll(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String suiteName,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) UUID environmentId,
            @RequestParam(required = false) String triggerType,
            @RequestParam(required = false) LocalDateTime from,
            @RequestParam(required = false) LocalDateTime to,
            @RequestParam(defaultValue = "startedAt") String sortBy,
            @RequestParam(defaultValue = "desc") String sortDir) {
        if (!ALLOWED_SORT_FIELDS.contains(sortBy)) sortBy = "startedAt";
        if (size < 1) size = 10;
        if (size > MAX_PAGE_SIZE) size = MAX_PAGE_SIZE;
        if (page < 0) page = 0;
        Sort sort = sortDir.equalsIgnoreCase("asc")
                ? Sort.by(sortBy).ascending()
                : Sort.by(sortBy).descending();
        return runService.findAll(suiteName, status, environmentId, triggerType, from, to,
                PageRequest.of(page, size, sort));
    }

    @GetMapping("/{id}")
    public TestRunResponse findById(@PathVariable UUID id) {
        return runService.findById(id);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        runService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/export")
    public ResponseEntity<TestRunResponse> export(@PathVariable UUID id) {
        TestRunResponse run = runService.export(id);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=run-" + id + ".json")
                .contentType(MediaType.APPLICATION_JSON)
                .body(run);
    }
}
