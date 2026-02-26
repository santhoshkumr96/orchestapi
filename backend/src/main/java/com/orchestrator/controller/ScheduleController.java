package com.orchestrator.controller;

import com.orchestrator.dto.CronPreviewResponse;
import com.orchestrator.dto.PageResponse;
import com.orchestrator.dto.RunScheduleRequest;
import com.orchestrator.dto.RunScheduleResponse;
import com.orchestrator.service.ScheduleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/run-schedules")
@RequiredArgsConstructor
public class ScheduleController {

    private static final Set<String> ALLOWED_SORT_FIELDS = Set.of(
            "createdAt", "updatedAt", "nextRunAt", "lastRunAt");
    private static final int MAX_PAGE_SIZE = 100;

    private final ScheduleService scheduleService;

    @PostMapping
    public ResponseEntity<RunScheduleResponse> create(@Valid @RequestBody RunScheduleRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(scheduleService.create(request));
    }

    @GetMapping
    public PageResponse<RunScheduleResponse> findAll(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(defaultValue = "createdAt") String sortBy,
            @RequestParam(defaultValue = "desc") String sortDir) {
        if (!ALLOWED_SORT_FIELDS.contains(sortBy)) sortBy = "createdAt";
        if (size < 1) size = 10;
        if (size > MAX_PAGE_SIZE) size = MAX_PAGE_SIZE;
        if (page < 0) page = 0;
        Sort sort = sortDir.equalsIgnoreCase("asc")
                ? Sort.by(sortBy).ascending()
                : Sort.by(sortBy).descending();
        return scheduleService.findAll(PageRequest.of(page, size, sort));
    }

    @GetMapping("/{id}")
    public RunScheduleResponse findById(@PathVariable UUID id) {
        return scheduleService.findById(id);
    }

    @GetMapping("/by-suite/{suiteId}")
    public List<RunScheduleResponse> findBySuiteId(@PathVariable UUID suiteId) {
        return scheduleService.findBySuiteId(suiteId);
    }

    @PutMapping("/{id}")
    public RunScheduleResponse update(@PathVariable UUID id,
                                       @Valid @RequestBody RunScheduleRequest request) {
        return scheduleService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        scheduleService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/toggle")
    public RunScheduleResponse toggle(@PathVariable UUID id) {
        return scheduleService.toggle(id);
    }

    @GetMapping("/preview")
    public CronPreviewResponse preview(@RequestParam String cron) {
        return scheduleService.preview(cron);
    }
}
