package com.orchestrator.service;

import com.orchestrator.dto.PageResponse;
import com.orchestrator.dto.TestSuiteRequest;
import com.orchestrator.dto.TestSuiteResponse;
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
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TestSuiteService {

    private final TestSuiteRepository repository;

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
}
