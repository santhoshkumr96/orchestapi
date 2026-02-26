package com.orchestrator.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestrator.dto.*;
import com.orchestrator.exception.NotFoundException;
import com.orchestrator.model.*;
import com.orchestrator.model.enums.BodyType;
import com.orchestrator.repository.TestStepRepository;
import com.orchestrator.repository.TestSuiteRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

@Service
@RequiredArgsConstructor
public class TestStepService {

    private final TestStepRepository stepRepository;
    private final TestSuiteRepository suiteRepository;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public List<TestStepResponse> findAllBySuiteId(UUID suiteId) {
        suiteRepository.findById(suiteId)
                .orElseThrow(() -> new NotFoundException("Test suite not found: " + suiteId));

        List<TestStep> steps = stepRepository.findBySuiteIdWithDetails(suiteId);
        stepRepository.findBySuiteIdWithVerifications(suiteId); // populates L1 cache for verifications

        return steps.stream()
                .map(TestStepResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public TestStepResponse findById(UUID suiteId, UUID stepId) {
        TestStep step = stepRepository.findByIdWithDetails(stepId)
                .orElseThrow(() -> new NotFoundException("Test step not found: " + stepId));
        stepRepository.findByIdWithVerifications(stepId); // populates L1 cache for verifications

        if (!step.getSuite().getId().equals(suiteId)) {
            throw new NotFoundException("Test step " + stepId + " does not belong to suite " + suiteId);
        }

        return TestStepResponse.from(step);
    }

    @Transactional
    public TestStepResponse create(UUID suiteId, TestStepRequest request) {
        TestSuite suite = suiteRepository.findById(suiteId)
                .orElseThrow(() -> new NotFoundException("Test suite not found: " + suiteId));

        if (stepRepository.existsByNameAndSuiteId(request.getName(), suiteId)) {
            throw new IllegalArgumentException("Step with name '" + request.getName() + "' already exists in this suite");
        }

        // Calculate next sort order
        List<TestStep> existingSteps = stepRepository.findBySuiteIdOrdered(suiteId);
        int maxSortOrder = existingSteps.stream()
                .mapToInt(TestStep::getSortOrder)
                .max()
                .orElse(-1);

        TestStep step = TestStep.builder()
                .suite(suite)
                .name(request.getName())
                .method(request.getMethod())
                .url(request.getUrl())
                .headers(toJson(request.getHeaders()))
                .queryParams(toJson(request.getQueryParams()))
                .bodyType(BodyType.valueOf(request.getBodyType()))
                .body(request.getBody() != null ? request.getBody() : "")
                .formDataFields(toJson(request.getFormDataFields()))
                .cacheable(request.isCacheable())
                .cacheTtlSeconds(request.getCacheTtlSeconds())
                .dependencyOnly(request.isDependencyOnly())
                .disabledDefaultHeaders(toJson(request.getDisabledDefaultHeaders()))
                .sortOrder(maxSortOrder + 1)
                .build();

        step = stepRepository.save(step);

        // Validate and apply sub-entities after save (need step ID for dependency validation)
        validateDependencies(suiteId, step.getId(), request.getDependencies());
        applySubEntities(step, request);

        return TestStepResponse.from(stepRepository.save(step));
    }

    @Transactional
    public TestStepResponse update(UUID suiteId, UUID stepId, TestStepRequest request) {
        TestStep step = stepRepository.findByIdWithDetails(stepId)
                .orElseThrow(() -> new NotFoundException("Test step not found: " + stepId));
        stepRepository.findByIdWithVerifications(stepId); // load verifications into L1 cache

        if (!step.getSuite().getId().equals(suiteId)) {
            throw new NotFoundException("Test step " + stepId + " does not belong to suite " + suiteId);
        }

        if (stepRepository.existsByNameAndSuiteIdAndIdNot(request.getName(), suiteId, stepId)) {
            throw new IllegalArgumentException("Step with name '" + request.getName() + "' already exists in this suite");
        }

        step.setName(request.getName());
        step.setMethod(request.getMethod());
        step.setUrl(request.getUrl());
        step.setHeaders(toJson(request.getHeaders()));
        step.setQueryParams(toJson(request.getQueryParams()));
        step.setBodyType(BodyType.valueOf(request.getBodyType()));
        step.setBody(request.getBody() != null ? request.getBody() : "");
        step.setFormDataFields(toJson(request.getFormDataFields()));
        step.setCacheable(request.isCacheable());
        step.setCacheTtlSeconds(request.getCacheTtlSeconds());
        step.setDependencyOnly(request.isDependencyOnly());
        step.setDisabledDefaultHeaders(toJson(request.getDisabledDefaultHeaders()));

        // Validate dependencies
        validateDependencies(suiteId, stepId, request.getDependencies());

        // Clear and reapply sub-entities — flush between clear and re-add
        // to avoid unique constraint violations (Hibernate defers orphan removal)
        step.getDependencies().clear();
        step.getResponseHandlers().clear();
        step.getExtractVariables().clear();
        step.getVerifications().clear();
        stepRepository.saveAndFlush(step);
        applySubEntities(step, request);

        return TestStepResponse.from(stepRepository.save(step));
    }

    @Transactional
    public void delete(UUID suiteId, UUID stepId) {
        TestStep step = stepRepository.findById(stepId)
                .orElseThrow(() -> new NotFoundException("Test step not found: " + stepId));

        if (!step.getSuite().getId().equals(suiteId)) {
            throw new NotFoundException("Test step " + stepId + " does not belong to suite " + suiteId);
        }

        step.setDeletedAt(LocalDateTime.now());
        stepRepository.save(step);
    }

    @Transactional
    public List<TestStepResponse> reorder(UUID suiteId, List<UUID> stepIds) {
        suiteRepository.findById(suiteId)
                .orElseThrow(() -> new NotFoundException("Test suite not found: " + suiteId));

        List<TestStep> steps = stepRepository.findBySuiteIdOrdered(suiteId);

        // Validate all step IDs belong to this suite
        Set<UUID> existingIds = new HashSet<>();
        for (TestStep step : steps) {
            existingIds.add(step.getId());
        }
        for (UUID id : stepIds) {
            if (!existingIds.contains(id)) {
                throw new IllegalArgumentException("Step " + id + " does not belong to suite " + suiteId);
            }
        }

        // Update sort orders
        Map<UUID, TestStep> stepMap = new HashMap<>();
        for (TestStep step : steps) {
            stepMap.put(step.getId(), step);
        }

        AtomicInteger order = new AtomicInteger(0);
        for (UUID id : stepIds) {
            TestStep step = stepMap.get(id);
            if (step != null) {
                step.setSortOrder(order.getAndIncrement());
            }
        }

        stepRepository.saveAll(steps);

        return stepRepository.findBySuiteIdWithDetails(suiteId).stream()
                .map(TestStepResponse::from)
                .toList();
    }

    private void validateDependencies(UUID suiteId, UUID stepId, List<StepDependencyDto> deps) {
        if (deps == null || deps.isEmpty()) return;

        // Load all steps in the suite for validation
        List<TestStep> suiteSteps = stepRepository.findBySuiteIdOrdered(suiteId);
        Set<UUID> suiteStepIds = new HashSet<>();
        for (TestStep s : suiteSteps) {
            suiteStepIds.add(s.getId());
        }

        for (StepDependencyDto dep : deps) {
            if (dep.getDependsOnStepId() == null) {
                throw new IllegalArgumentException("Dependency target step ID is required");
            }
            if (dep.getDependsOnStepId().equals(stepId)) {
                throw new IllegalArgumentException("A step cannot depend on itself");
            }
            if (!suiteStepIds.contains(dep.getDependsOnStepId())) {
                throw new IllegalArgumentException("Dependency target step " + dep.getDependsOnStepId() + " is not in the same suite");
            }
        }

        // Build dependency graph for cycle detection
        // Include existing dependencies from other steps + the new ones for this step
        Map<UUID, List<UUID>> graph = new HashMap<>();
        for (TestStep s : suiteSteps) {
            if (!s.getId().equals(stepId) && s.getDependencies() != null) {
                List<UUID> targets = new ArrayList<>();
                for (StepDependency d : s.getDependencies()) {
                    targets.add(d.getDependsOnStepId());
                }
                if (!targets.isEmpty()) {
                    graph.put(s.getId(), targets);
                }
            }
        }

        // Add this step's proposed dependencies
        List<UUID> newTargets = new ArrayList<>();
        for (StepDependencyDto dep : deps) {
            newTargets.add(dep.getDependsOnStepId());
        }
        graph.put(stepId, newTargets);

        if (hasCycle(graph)) {
            throw new IllegalArgumentException("Adding these dependencies would create a circular dependency");
        }
    }

    private boolean hasCycle(Map<UUID, List<UUID>> graph) {
        Set<UUID> visited = new HashSet<>();
        Set<UUID> inStack = new HashSet<>();

        for (UUID node : graph.keySet()) {
            if (dfs(node, graph, visited, inStack)) {
                return true;
            }
        }
        return false;
    }

    private boolean dfs(UUID node, Map<UUID, List<UUID>> graph, Set<UUID> visited, Set<UUID> inStack) {
        if (inStack.contains(node)) return true;
        if (visited.contains(node)) return false;

        visited.add(node);
        inStack.add(node);

        List<UUID> neighbors = graph.getOrDefault(node, Collections.emptyList());
        for (UUID neighbor : neighbors) {
            if (dfs(neighbor, graph, visited, inStack)) {
                return true;
            }
        }

        inStack.remove(node);
        return false;
    }

    private void applySubEntities(TestStep step, TestStepRequest request) {
        // Apply dependencies
        if (request.getDependencies() != null) {
            for (StepDependencyDto dto : request.getDependencies()) {
                StepDependency dep = StepDependency.builder()
                        .step(step)
                        .dependsOnStepId(dto.getDependsOnStepId())
                        .useCache(dto.isUseCache())
                        .reuseManualInput(dto.isReuseManualInput())
                        .build();
                step.getDependencies().add(dep);
            }
        }

        // Apply response handlers
        if (request.getResponseHandlers() != null) {
            for (StepResponseHandlerDto dto : request.getResponseHandlers()) {
                StepResponseHandler handler = StepResponseHandler.builder()
                        .step(step)
                        .matchCode(dto.getMatchCode())
                        .action(dto.getAction())
                        .sideEffectStepId(dto.getSideEffectStepId())
                        .retryCount(dto.getRetryCount())
                        .retryDelaySeconds(dto.getRetryDelaySeconds())
                        .priority(dto.getPriority())
                        .build();
                step.getResponseHandlers().add(handler);
            }
        }

        // Apply extract variables
        if (request.getExtractVariables() != null) {
            for (StepExtractVariableDto dto : request.getExtractVariables()) {
                StepExtractVariable var = StepExtractVariable.builder()
                        .step(step)
                        .variableName(dto.getVariableName())
                        .jsonPath(dto.getJsonPath())
                        .source(dto.getSource())
                        .build();
                step.getExtractVariables().add(var);
            }
        }

        // Apply verifications
        if (request.getVerifications() != null) {
            AtomicInteger vOrder = new AtomicInteger(0);
            for (VerificationDto vDto : request.getVerifications()) {
                StepVerification verification = StepVerification.builder()
                        .step(step)
                        .connectorName(vDto.getConnectorName())
                        .query(vDto.getQuery() != null ? vDto.getQuery() : "")
                        .timeoutSeconds(vDto.getTimeoutSeconds())
                        .queryTimeoutSeconds(vDto.getQueryTimeoutSeconds())
                        .preListen(vDto.isPreListen())
                        .sortOrder(vOrder.getAndIncrement())
                        .build();

                // Add assertions
                if (vDto.getAssertions() != null) {
                    AtomicInteger aOrder = new AtomicInteger(0);
                    for (AssertionDto aDto : vDto.getAssertions()) {
                        VerificationAssertion assertion = VerificationAssertion.builder()
                                .verification(verification)
                                .jsonPath(aDto.getJsonPath())
                                .operator(aDto.getOperator())
                                .expectedValue(aDto.getExpectedValue() != null ? aDto.getExpectedValue() : "")
                                .sortOrder(aOrder.getAndIncrement())
                                .build();
                        verification.getAssertions().add(assertion);
                    }
                }

                step.getVerifications().add(verification);
            }
        }
    }

    private String toJson(Object obj) {
        if (obj == null) return "[]";
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }
}
