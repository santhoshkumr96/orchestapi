package com.orchestrator.service;

import com.orchestrator.dto.CronPreviewResponse;
import com.orchestrator.dto.PageResponse;
import com.orchestrator.dto.RunScheduleRequest;
import com.orchestrator.dto.RunScheduleResponse;
import com.orchestrator.dto.SuiteExecutionResult;
import com.orchestrator.exception.NotFoundException;
import com.orchestrator.model.Environment;
import com.orchestrator.model.RunSchedule;
import com.orchestrator.model.TestRun;
import com.orchestrator.model.TestSuite;
import com.orchestrator.model.enums.TriggerType;
import com.orchestrator.repository.EnvironmentRepository;
import com.orchestrator.repository.RunScheduleRepository;
import com.orchestrator.repository.TestSuiteRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.scheduling.support.CronTrigger;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;

@Service
@Slf4j
public class ScheduleService {

    private final RunScheduleRepository repository;
    private final TestSuiteRepository suiteRepository;
    private final EnvironmentRepository environmentRepository;
    private final RunService runService;
    private final ExecutionService executionService;
    private final TaskScheduler taskScheduler;

    private final ConcurrentHashMap<UUID, ScheduledFuture<?>> scheduledTasks = new ConcurrentHashMap<>();

    public ScheduleService(RunScheduleRepository repository,
                           TestSuiteRepository suiteRepository,
                           EnvironmentRepository environmentRepository,
                           RunService runService,
                           @Lazy ExecutionService executionService,
                           TaskScheduler taskScheduler) {
        this.repository = repository;
        this.suiteRepository = suiteRepository;
        this.environmentRepository = environmentRepository;
        this.runService = runService;
        this.executionService = executionService;
        this.taskScheduler = taskScheduler;
    }

    @PostConstruct
    public void loadSchedulesOnStartup() {
        List<RunSchedule> active = repository.findAllActive();
        for (RunSchedule schedule : active) {
            registerTask(schedule);
        }
        log.info("Loaded {} active schedules on startup", active.size());
    }

    // ── CRUD ──────────────────────────────────────────────────────────────

    @Transactional
    public RunScheduleResponse create(RunScheduleRequest req) {
        // Validate suite exists
        suiteRepository.findById(req.getSuiteId())
                .orElseThrow(() -> new NotFoundException("Test suite not found: " + req.getSuiteId()));

        // Validate environment exists
        environmentRepository.findById(req.getEnvironmentId())
                .orElseThrow(() -> new NotFoundException("Environment not found: " + req.getEnvironmentId()));

        // Normalize and validate cron expression
        String cron = normalizeCron(req.getCronExpression());
        try {
            CronExpression.parse(cron);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid cron expression: " + e.getMessage());
        }

        RunSchedule schedule = RunSchedule.builder()
                .suiteId(req.getSuiteId())
                .environmentId(req.getEnvironmentId())
                .cronExpression(cron)
                .description(req.getDescription())
                .active(true)
                .nextRunAt(computeNextRunAt(cron))
                .build();

        schedule = repository.save(schedule);
        registerTask(schedule);

        return toResponse(schedule);
    }

    @Transactional(readOnly = true)
    public PageResponse<RunScheduleResponse> findAll(Pageable pageable) {
        Page<RunSchedule> page = repository.findAll(pageable);
        return PageResponse.from(page, this::toResponse);
    }

    @Transactional(readOnly = true)
    public List<RunScheduleResponse> findBySuiteId(UUID suiteId) {
        return repository.findBySuiteId(suiteId).stream()
                .map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public long countActive() {
        return repository.findAllActive().size();
    }

    @Transactional(readOnly = true)
    public RunScheduleResponse findById(UUID id) {
        RunSchedule schedule = repository.findById(id)
                .orElseThrow(() -> new NotFoundException("Schedule not found: " + id));
        return toResponse(schedule);
    }

    @Transactional
    public RunScheduleResponse update(UUID id, RunScheduleRequest req) {
        RunSchedule schedule = repository.findById(id)
                .orElseThrow(() -> new NotFoundException("Schedule not found: " + id));

        // Validate suite exists
        suiteRepository.findById(req.getSuiteId())
                .orElseThrow(() -> new NotFoundException("Test suite not found: " + req.getSuiteId()));

        // Validate environment exists
        environmentRepository.findById(req.getEnvironmentId())
                .orElseThrow(() -> new NotFoundException("Environment not found: " + req.getEnvironmentId()));

        // Normalize and validate cron expression
        String cron = normalizeCron(req.getCronExpression());
        try {
            CronExpression.parse(cron);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid cron expression: " + e.getMessage());
        }

        // Cancel existing task
        cancelTask(schedule.getId());

        // Update entity
        schedule.setSuiteId(req.getSuiteId());
        schedule.setEnvironmentId(req.getEnvironmentId());
        schedule.setCronExpression(cron);
        schedule.setDescription(req.getDescription());
        schedule.setNextRunAt(schedule.getActive() ? computeNextRunAt(cron) : null);

        schedule = repository.save(schedule);

        // Register new task if active
        if (schedule.getActive()) {
            registerTask(schedule);
        }

        return toResponse(schedule);
    }

    @Transactional
    public void delete(UUID id) {
        RunSchedule schedule = repository.findById(id)
                .orElseThrow(() -> new NotFoundException("Schedule not found: " + id));
        cancelTask(id);
        schedule.setDeletedAt(LocalDateTime.now());
        repository.save(schedule);
    }

    @Transactional
    public RunScheduleResponse toggle(UUID id) {
        RunSchedule schedule = repository.findById(id)
                .orElseThrow(() -> new NotFoundException("Schedule not found: " + id));

        // Flip active flag
        boolean newActive = !schedule.getActive();
        schedule.setActive(newActive);

        if (newActive) {
            schedule.setNextRunAt(computeNextRunAt(schedule.getCronExpression()));
            schedule = repository.save(schedule);
            registerTask(schedule);
        } else {
            schedule.setNextRunAt(null);
            schedule = repository.save(schedule);
            cancelTask(id);
        }

        return toResponse(schedule);
    }

    // ── Cron preview ──────────────────────────────────────────────────────

    public CronPreviewResponse preview(String cronExpression) {
        try {
            CronExpression cron = CronExpression.parse(normalizeCron(cronExpression));
            List<LocalDateTime> fireTimes = new ArrayList<>();
            LocalDateTime next = LocalDateTime.now();
            for (int i = 0; i < 5; i++) {
                next = cron.next(next);
                if (next == null) break;
                fireTimes.add(next);
            }
            return CronPreviewResponse.builder()
                    .valid(true)
                    .nextFireTimes(fireTimes)
                    .build();
        } catch (IllegalArgumentException e) {
            return CronPreviewResponse.builder()
                    .valid(false)
                    .error(e.getMessage())
                    .build();
        }
    }

    // ── Task scheduling ───────────────────────────────────────────────────

    private void registerTask(RunSchedule schedule) {
        cancelTask(schedule.getId()); // cancel existing if any
        try {
            CronTrigger trigger = new CronTrigger(normalizeCron(schedule.getCronExpression()));
            ScheduledFuture<?> future = taskScheduler.schedule(
                    () -> executeScheduledRun(schedule.getId()),
                    trigger);
            scheduledTasks.put(schedule.getId(), future);
        } catch (Exception e) {
            log.error("Failed to register schedule {}: {}", schedule.getId(), e.getMessage());
        }
    }

    private void cancelTask(UUID scheduleId) {
        ScheduledFuture<?> future = scheduledTasks.remove(scheduleId);
        if (future != null) {
            future.cancel(false);
        }
    }

    private void executeScheduledRun(UUID scheduleId) {
        // 1. Load schedule from DB (might have been deleted/disabled)
        RunSchedule schedule = repository.findById(scheduleId).orElse(null);
        if (schedule == null || !schedule.getActive()) {
            cancelTask(scheduleId);
            return;
        }

        UUID runId = null;
        try {
            // 2. Create a TestRun record
            TestRun run = runService.createRun(
                    schedule.getSuiteId(),
                    schedule.getEnvironmentId(),
                    TriggerType.SCHEDULED,
                    scheduleId);
            runId = run.getId();

            // 3. Prepare the suite run (loads all data inside a transaction)
            ExecutionService.PreparedExecution prepared =
                    executionService.prepareSuiteRun(schedule.getSuiteId(), schedule.getEnvironmentId());

            // 4. Execute non-interactively (no SSE, defaults for manual inputs)
            SuiteExecutionResult result = executionService.executePreparedNonInteractive(prepared);

            // 5. Complete the run with results
            runService.completeRun(runId, result);

            // 6. Update schedule timestamps
            schedule.setLastRunAt(LocalDateTime.now());
            schedule.setNextRunAt(computeNextRunAt(schedule.getCronExpression()));
            repository.save(schedule);

            log.info("Scheduled run completed for suite {} (schedule {}): {}",
                    schedule.getSuiteId(), scheduleId, result.getStatus());

        } catch (Exception e) {
            log.error("Scheduled run failed for schedule {}: {}", scheduleId, e.getMessage(), e);
            if (runId != null) {
                runService.failRun(runId, e.getMessage());
            }
            // Update nextRunAt even on failure
            try {
                schedule.setLastRunAt(LocalDateTime.now());
                schedule.setNextRunAt(computeNextRunAt(schedule.getCronExpression()));
                repository.save(schedule);
            } catch (Exception ex) {
                log.error("Failed to update schedule timestamps: {}", ex.getMessage());
            }
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    /**
     * Normalize cron expression: if user provides 5 fields (standard Unix cron),
     * prepend "0 " to add seconds field. Spring CronExpression requires 6 fields.
     */
    private String normalizeCron(String cronExpression) {
        String trimmed = cronExpression.trim();
        String[] fields = trimmed.split("\\s+");
        if (fields.length == 5) {
            return "0 " + trimmed;
        }
        return trimmed;
    }

    private LocalDateTime computeNextRunAt(String cronExpression) {
        try {
            CronExpression cron = CronExpression.parse(normalizeCron(cronExpression));
            return cron.next(LocalDateTime.now());
        } catch (Exception e) {
            return null;
        }
    }

    private RunScheduleResponse toResponse(RunSchedule schedule) {
        return RunScheduleResponse.builder()
                .id(schedule.getId().toString())
                .suiteId(schedule.getSuiteId().toString())
                .suiteName(resolveSuiteName(schedule.getSuiteId()))
                .environmentId(schedule.getEnvironmentId().toString())
                .environmentName(resolveEnvironmentName(schedule.getEnvironmentId()))
                .cronExpression(schedule.getCronExpression())
                .active(schedule.getActive())
                .description(schedule.getDescription())
                .lastRunAt(schedule.getLastRunAt())
                .nextRunAt(schedule.getNextRunAt())
                .createdAt(schedule.getCreatedAt())
                .updatedAt(schedule.getUpdatedAt())
                .build();
    }

    private String resolveSuiteName(UUID suiteId) {
        return suiteRepository.findById(suiteId)
                .map(TestSuite::getName)
                .orElse("(deleted)");
    }

    private String resolveEnvironmentName(UUID environmentId) {
        return environmentRepository.findById(environmentId)
                .map(Environment::getName)
                .orElse("(deleted)");
    }
}
