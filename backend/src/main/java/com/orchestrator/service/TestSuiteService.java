package com.orchestrator.service;

import com.orchestrator.dto.*;
import com.orchestrator.exception.NotFoundException;
import com.orchestrator.model.TestSuite;
import com.orchestrator.repository.TestSuiteRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TestSuiteService {

    private final TestSuiteRepository repository;
    private final TestStepService stepService;

    @Transactional(readOnly = true)
    public PageResponse<TestSuiteResponse> findAllPaged(String name, Pageable pageable) {
        Specification<TestSuite> spec = Specification.where(null);

        if (name != null && !name.isBlank()) {
            spec = spec.and((root, query, cb) ->
                    cb.like(cb.lower(root.get("name")), "%" + name.toLowerCase() + "%"));
        }

        // Step 1: paginated query for IDs only
        Page<TestSuite> idPage = repository.findAll(spec, pageable);
        List<UUID> ids = idPage.getContent().stream().map(TestSuite::getId).toList();

        if (ids.isEmpty()) {
            return PageResponse.from(idPage, TestSuiteResponse::from);
        }

        // Step 2: fetch full details for current page IDs
        List<TestSuite> withSteps = repository.findByIdsWithSteps(ids);

        // Preserve page order
        Map<UUID, TestSuite> byId = withSteps.stream()
                .collect(Collectors.toMap(TestSuite::getId, Function.identity()));
        List<TestSuite> ordered = ids.stream().map(byId::get).toList();

        Page<TestSuite> fullPage = new PageImpl<>(ordered, pageable, idPage.getTotalElements());
        return PageResponse.from(fullPage, TestSuiteResponse::from);
    }

    @Transactional(readOnly = true)
    public TestSuiteResponse findById(UUID id) {
        TestSuite suite = repository.findByIdWithSteps(id)
                .orElseThrow(() -> new NotFoundException("Test suite not found: " + id));
        return TestSuiteResponse.from(suite);
    }

    @Transactional
    public TestSuiteResponse create(TestSuiteRequest request) {
        if (repository.existsByName(request.getName())) {
            throw new IllegalArgumentException("Test suite with name '" + request.getName() + "' already exists");
        }

        TestSuite suite = TestSuite.builder()
                .name(request.getName())
                .description(request.getDescription() != null ? request.getDescription() : "")
                .defaultEnvironmentId(request.getDefaultEnvironmentId())
                .build();

        return TestSuiteResponse.from(repository.save(suite));
    }

    @Transactional
    public TestSuiteResponse update(UUID id, TestSuiteRequest request) {
        TestSuite suite = repository.findByIdWithSteps(id)
                .orElseThrow(() -> new NotFoundException("Test suite not found: " + id));

        if (repository.existsByNameAndIdNot(request.getName(), id)) {
            throw new IllegalArgumentException("Test suite with name '" + request.getName() + "' already exists");
        }

        suite.setName(request.getName());
        suite.setDescription(request.getDescription() != null ? request.getDescription() : "");
        suite.setDefaultEnvironmentId(request.getDefaultEnvironmentId());

        return TestSuiteResponse.from(repository.save(suite));
    }

    @Transactional
    public void delete(UUID id) {
        TestSuite suite = repository.findById(id)
                .orElseThrow(() -> new NotFoundException("Test suite not found: " + id));
        suite.setDeletedAt(LocalDateTime.now());
        repository.save(suite);
    }

    @Transactional
    public TestSuiteResponse importSuite(TestSuiteImportRequest request) {
        if (repository.existsByName(request.getName())) {
            throw new IllegalArgumentException("Test suite with name '" + request.getName() + "' already exists");
        }

        // Create suite
        TestSuite suite = TestSuite.builder()
                .name(request.getName())
                .description(request.getDescription() != null ? request.getDescription() : "")
                .build();
        suite = repository.save(suite);
        UUID suiteId = suite.getId();

        if (request.getSteps() == null || request.getSteps().isEmpty()) {
            return TestSuiteResponse.from(suite);
        }

        // Pass 1: Create all steps WITHOUT dependencies and handlers (need IDs first)
        Map<String, UUID> stepNameToId = new LinkedHashMap<>();
        for (TestSuiteImportRequest.ImportStepDto importStep : request.getSteps()) {
            TestStepRequest stepReq = buildStepRequest(importStep, false);
            TestStepResponse created = stepService.create(suiteId, stepReq);
            stepNameToId.put(created.getName(), created.getId());
        }

        // Pass 2: Update steps that have dependencies or handlers with sideEffectStepName
        for (TestSuiteImportRequest.ImportStepDto importStep : request.getSteps()) {
            boolean hasDeps = importStep.getDependencies() != null && !importStep.getDependencies().isEmpty();
            boolean hasHandlersWithSideEffect = importStep.getResponseHandlers() != null &&
                    importStep.getResponseHandlers().stream()
                            .anyMatch(h -> h.getSideEffectStepName() != null && !h.getSideEffectStepName().isBlank());

            if (hasDeps || hasHandlersWithSideEffect) {
                UUID stepId = stepNameToId.get(importStep.getName());
                TestStepRequest updateReq = buildStepRequest(importStep, true);

                // Resolve dependency names to IDs
                if (hasDeps) {
                    List<StepDependencyDto> resolvedDeps = new ArrayList<>();
                    for (TestSuiteImportRequest.ImportDependencyDto dep : importStep.getDependencies()) {
                        UUID targetId = stepNameToId.get(dep.getDependsOnStepName());
                        if (targetId == null) {
                            throw new IllegalArgumentException(
                                    "Dependency target step '" + dep.getDependsOnStepName() + "' not found in import data");
                        }
                        resolvedDeps.add(StepDependencyDto.builder()
                                .dependsOnStepId(targetId)
                                .useCache(dep.isUseCache())
                                .reuseManualInput(dep.isReuseManualInput())
                                .build());
                    }
                    updateReq.setDependencies(resolvedDeps);
                }

                // Resolve handler sideEffectStepName to ID
                if (importStep.getResponseHandlers() != null) {
                    List<StepResponseHandlerDto> resolvedHandlers = new ArrayList<>();
                    for (TestSuiteImportRequest.ImportHandlerDto h : importStep.getResponseHandlers()) {
                        UUID sideEffectId = null;
                        if (h.getSideEffectStepName() != null && !h.getSideEffectStepName().isBlank()) {
                            sideEffectId = stepNameToId.get(h.getSideEffectStepName());
                            if (sideEffectId == null) {
                                throw new IllegalArgumentException(
                                        "Side effect step '" + h.getSideEffectStepName() + "' not found in import data");
                            }
                        }
                        resolvedHandlers.add(StepResponseHandlerDto.builder()
                                .matchCode(h.getMatchCode())
                                .action(h.getAction())
                                .sideEffectStepId(sideEffectId)
                                .retryCount(h.getRetryCount())
                                .retryDelaySeconds(h.getRetryDelaySeconds())
                                .priority(h.getPriority())
                                .build());
                    }
                    updateReq.setResponseHandlers(resolvedHandlers);
                }

                stepService.update(suiteId, stepId, updateReq);
            }
        }

        // Re-fetch to get accurate step count
        return TestSuiteResponse.from(repository.findByIdWithSteps(suiteId)
                .orElseThrow(() -> new NotFoundException("Test suite not found: " + suiteId)));
    }

    private TestStepRequest buildStepRequest(TestSuiteImportRequest.ImportStepDto importStep, boolean includeHandlers) {
        TestStepRequest req = new TestStepRequest();
        req.setName(importStep.getName());
        req.setMethod(importStep.getMethod() != null ? importStep.getMethod() : com.orchestrator.model.HttpMethod.GET);
        req.setUrl(importStep.getUrl() != null ? importStep.getUrl() : "");
        req.setHeaders(importStep.getHeaders() != null ? importStep.getHeaders() : new ArrayList<>());
        req.setQueryParams(importStep.getQueryParams() != null ? importStep.getQueryParams() : new ArrayList<>());
        req.setBodyType(importStep.getBodyType() != null ? importStep.getBodyType() : "NONE");
        req.setBody(importStep.getBody() != null ? importStep.getBody() : "");
        req.setFormDataFields(importStep.getFormDataFields() != null ? importStep.getFormDataFields() : new ArrayList<>());
        req.setCacheable(importStep.isCacheable());
        req.setCacheTtlSeconds(importStep.getCacheTtlSeconds());
        req.setDependencyOnly(importStep.isDependencyOnly());
        req.setDisabledDefaultHeaders(importStep.getDisabledDefaultHeaders() != null ? importStep.getDisabledDefaultHeaders() : new ArrayList<>());
        req.setGroupName(importStep.getGroupName());
        req.setExtractVariables(importStep.getExtractVariables() != null ? importStep.getExtractVariables() : new ArrayList<>());
        req.setVerifications(importStep.getVerifications() != null ? importStep.getVerifications() : new ArrayList<>());
        req.setResponseValidations(importStep.getResponseValidations() != null ? importStep.getResponseValidations() : new ArrayList<>());

        // Dependencies and handlers with name-references are empty in pass 1
        req.setDependencies(new ArrayList<>());

        if (includeHandlers) {
            // Will be overridden by caller for steps that need side-effect resolution
            // For steps without side effects, convert handlers directly
            if (importStep.getResponseHandlers() != null) {
                List<StepResponseHandlerDto> handlers = new ArrayList<>();
                for (TestSuiteImportRequest.ImportHandlerDto h : importStep.getResponseHandlers()) {
                    handlers.add(StepResponseHandlerDto.builder()
                            .matchCode(h.getMatchCode())
                            .action(h.getAction())
                            .retryCount(h.getRetryCount())
                            .retryDelaySeconds(h.getRetryDelaySeconds())
                            .priority(h.getPriority())
                            .build());
                }
                req.setResponseHandlers(handlers);
            }
        } else {
            // Pass 1: include handlers without side effects directly
            if (importStep.getResponseHandlers() != null) {
                boolean anySideEffect = importStep.getResponseHandlers().stream()
                        .anyMatch(h -> h.getSideEffectStepName() != null && !h.getSideEffectStepName().isBlank());
                if (!anySideEffect) {
                    List<StepResponseHandlerDto> handlers = new ArrayList<>();
                    for (TestSuiteImportRequest.ImportHandlerDto h : importStep.getResponseHandlers()) {
                        handlers.add(StepResponseHandlerDto.builder()
                                .matchCode(h.getMatchCode())
                                .action(h.getAction())
                                .retryCount(h.getRetryCount())
                                .retryDelaySeconds(h.getRetryDelaySeconds())
                                .priority(h.getPriority())
                                .build());
                    }
                    req.setResponseHandlers(handlers);
                } else {
                    req.setResponseHandlers(new ArrayList<>());
                }
            } else {
                req.setResponseHandlers(new ArrayList<>());
            }
        }

        return req;
    }
}
