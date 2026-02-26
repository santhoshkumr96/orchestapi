package com.orchestrator.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestrator.dto.PageResponse;
import com.orchestrator.dto.SuiteExecutionResult;
import com.orchestrator.dto.TestRunResponse;
import com.orchestrator.exception.NotFoundException;
import com.orchestrator.model.Environment;
import com.orchestrator.model.TestRun;
import com.orchestrator.model.TestSuite;
import com.orchestrator.model.enums.RunStatus;
import com.orchestrator.model.enums.TriggerType;
import com.orchestrator.repository.EnvironmentRepository;
import com.orchestrator.repository.TestRunRepository;
import com.orchestrator.repository.TestSuiteRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class RunService {

    private final TestRunRepository repository;
    private final TestSuiteRepository suiteRepository;
    private final EnvironmentRepository environmentRepository;
    private final ObjectMapper objectMapper;

    @Transactional
    public TestRun createRun(UUID suiteId, UUID environmentId, TriggerType triggerType, UUID scheduleId) {
        TestRun run = TestRun.builder()
                .suiteId(suiteId)
                .environmentId(environmentId)
                .triggerType(triggerType)
                .scheduleId(scheduleId)
                .status(RunStatus.RUNNING)
                .startedAt(LocalDateTime.now())
                .build();
        return repository.save(run);
    }

    @Transactional
    public void completeRun(UUID runId, SuiteExecutionResult result) {
        TestRun run = repository.findById(runId)
                .orElseThrow(() -> new NotFoundException("Run not found: " + runId));
        run.setCompletedAt(LocalDateTime.now());
        run.setTotalDurationMs(result.getTotalDurationMs());

        String statusStr = result.getStatus();
        try {
            run.setStatus(RunStatus.valueOf(statusStr));
        } catch (IllegalArgumentException e) {
            run.setStatus(RunStatus.FAILURE);
        }

        try {
            run.setResultData(objectMapper.writeValueAsString(result));
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize run result: {}", e.getMessage());
            run.setResultData(null);
        }
        repository.save(run);
    }

    @Transactional
    public void failRun(UUID runId, String errorMessage) {
        TestRun run = repository.findById(runId).orElse(null);
        if (run == null) return;
        run.setStatus(RunStatus.FAILURE);
        run.setCompletedAt(LocalDateTime.now());
        repository.save(run);
    }

    @Transactional
    public void cancelRun(UUID runId) {
        TestRun run = repository.findById(runId).orElse(null);
        if (run == null) return;
        run.setStatus(RunStatus.CANCELLED);
        run.setCompletedAt(LocalDateTime.now());
        repository.save(run);
    }

    @Transactional(readOnly = true)
    public PageResponse<TestRunResponse> findAll(String suiteName, String status, UUID environmentId,
                                                  String triggerType, LocalDateTime from, LocalDateTime to,
                                                  Pageable pageable) {
        Specification<TestRun> spec = Specification.where(null);

        if (status != null && !status.isBlank()) {
            try {
                RunStatus rs = RunStatus.valueOf(status);
                spec = spec.and((root, query, cb) -> cb.equal(root.get("status"), rs));
            } catch (IllegalArgumentException ignored) {}
        }
        if (environmentId != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("environmentId"), environmentId));
        }
        if (triggerType != null && !triggerType.isBlank()) {
            try {
                TriggerType tt = TriggerType.valueOf(triggerType);
                spec = spec.and((root, query, cb) -> cb.equal(root.get("triggerType"), tt));
            } catch (IllegalArgumentException ignored) {}
        }
        if (from != null) {
            spec = spec.and((root, query, cb) -> cb.greaterThanOrEqualTo(root.get("startedAt"), from));
        }
        if (to != null) {
            spec = spec.and((root, query, cb) -> cb.lessThanOrEqualTo(root.get("startedAt"), to));
        }
        if (suiteName != null && !suiteName.isBlank()) {
            String pattern = "%" + suiteName.toLowerCase() + "%";
            spec = spec.and((root, query, cb) -> {
                var sub = query.subquery(UUID.class);
                var suiteRoot = sub.from(TestSuite.class);
                sub.select(suiteRoot.get("id"))
                        .where(cb.like(cb.lower(suiteRoot.get("name")), pattern));
                return root.get("suiteId").in(sub);
            });
        }

        Page<TestRun> page = repository.findAll(spec, pageable);
        return PageResponse.from(page, this::toListResponse);
    }

    @Transactional(readOnly = true)
    public TestRunResponse findById(UUID id) {
        TestRun run = repository.findById(id)
                .orElseThrow(() -> new NotFoundException("Run not found: " + id));
        return toDetailResponse(run);
    }

    @Transactional
    public void delete(UUID id) {
        TestRun run = repository.findById(id)
                .orElseThrow(() -> new NotFoundException("Run not found: " + id));
        run.setDeletedAt(LocalDateTime.now());
        repository.save(run);
    }

    @Transactional(readOnly = true)
    public TestRunResponse export(UUID id) {
        return findById(id);
    }

    @Transactional(readOnly = true)
    public long countByStatus(RunStatus status) {
        Specification<TestRun> spec = (root, query, cb) -> cb.equal(root.get("status"), status);
        return repository.count(spec);
    }

    @Transactional(readOnly = true)
    public long countAll() {
        return repository.count();
    }

    private TestRunResponse toListResponse(TestRun run) {
        return TestRunResponse.builder()
                .id(run.getId().toString())
                .suiteId(run.getSuiteId().toString())
                .suiteName(resolveSuiteName(run.getSuiteId()))
                .environmentId(run.getEnvironmentId().toString())
                .environmentName(resolveEnvironmentName(run.getEnvironmentId()))
                .triggerType(run.getTriggerType().name())
                .scheduleId(run.getScheduleId() != null ? run.getScheduleId().toString() : null)
                .status(run.getStatus().name())
                .startedAt(run.getStartedAt())
                .completedAt(run.getCompletedAt())
                .totalDurationMs(run.getTotalDurationMs())
                .resultData(null) // don't include in list
                .createdAt(run.getCreatedAt())
                .build();
    }

    private TestRunResponse toDetailResponse(TestRun run) {
        TestRunResponse resp = toListResponse(run);
        if (run.getResultData() != null) {
            try {
                resp.setResultData(objectMapper.readValue(run.getResultData(), SuiteExecutionResult.class));
            } catch (JsonProcessingException e) {
                log.error("Failed to deserialize run result: {}", e.getMessage());
            }
        }
        return resp;
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
