package com.orchestrator.controller;

import com.orchestrator.dto.PageResponse;
import com.orchestrator.dto.TestSuiteRequest;
import com.orchestrator.dto.TestSuiteResponse;
import com.orchestrator.service.TestSuiteService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/test-suites")
@RequiredArgsConstructor
public class TestSuiteController {

    private static final Set<String> ALLOWED_SORT_FIELDS = Set.of("name", "createdAt", "updatedAt");
    private static final int MAX_PAGE_SIZE = 100;

    private final TestSuiteService service;

    @GetMapping
    public PageResponse<TestSuiteResponse> findAll(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String name,
            @RequestParam(defaultValue = "name") String sortBy,
            @RequestParam(defaultValue = "asc") String sortDir) {
        if (!ALLOWED_SORT_FIELDS.contains(sortBy)) {
            sortBy = "name";
        }
        if (size < 1) size = 10;
        if (size > MAX_PAGE_SIZE) size = MAX_PAGE_SIZE;
        if (page < 0) page = 0;

        Sort sort = sortDir.equalsIgnoreCase("desc")
                ? Sort.by(sortBy).descending()
                : Sort.by(sortBy).ascending();
        return service.findAllPaged(name, PageRequest.of(page, size, sort));
    }

    @GetMapping("/{id}")
    public TestSuiteResponse findById(@PathVariable UUID id) {
        return service.findById(id);
    }

    @PostMapping
    public ResponseEntity<TestSuiteResponse> create(@Valid @RequestBody TestSuiteRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
    }

    @PutMapping("/{id}")
    public TestSuiteResponse update(@PathVariable UUID id, @Valid @RequestBody TestSuiteRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
