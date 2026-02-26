package com.orchestrator.controller;

import com.orchestrator.dto.ReorderRequest;
import com.orchestrator.dto.TestStepRequest;
import com.orchestrator.dto.TestStepResponse;
import com.orchestrator.service.ExecutionService;
import com.orchestrator.service.ImportService;
import com.orchestrator.service.TestStepService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/test-suites/{suiteId}/steps")
@RequiredArgsConstructor
public class TestStepController {

    private final TestStepService service;
    private final ImportService importService;
    private final ExecutionService executionService;

    @GetMapping
    public List<TestStepResponse> findAll(@PathVariable UUID suiteId) {
        return service.findAllBySuiteId(suiteId);
    }

    @GetMapping("/{stepId}")
    public TestStepResponse findById(@PathVariable UUID suiteId, @PathVariable UUID stepId) {
        return service.findById(suiteId, stepId);
    }

    @PostMapping
    public ResponseEntity<TestStepResponse> create(
            @PathVariable UUID suiteId,
            @Valid @RequestBody TestStepRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(suiteId, request));
    }

    @PutMapping("/{stepId}")
    public TestStepResponse update(
            @PathVariable UUID suiteId,
            @PathVariable UUID stepId,
            @Valid @RequestBody TestStepRequest request) {
        return service.update(suiteId, stepId, request);
    }

    @DeleteMapping("/{stepId}")
    public ResponseEntity<Void> delete(@PathVariable UUID suiteId, @PathVariable UUID stepId) {
        service.delete(suiteId, stepId);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/reorder")
    public List<TestStepResponse> reorder(
            @PathVariable UUID suiteId,
            @Valid @RequestBody ReorderRequest request) {
        return service.reorder(suiteId, request.getStepIds());
    }

    @GetMapping("/{stepId}/curl")
    public Map<String, String> generateCurl(
            @PathVariable UUID suiteId,
            @PathVariable UUID stepId,
            @RequestParam(required = false) UUID environmentId) {
        String curl = executionService.generateCurl(suiteId, stepId, environmentId);
        return Map.of("curl", curl);
    }

    @PostMapping("/import-curl")
    @ResponseStatus(HttpStatus.CREATED)
    public TestStepResponse importCurl(@PathVariable UUID suiteId, @RequestBody Map<String, String> body) {
        String curl = body.get("curl");
        if (curl == null || curl.isBlank()) {
            throw new IllegalArgumentException("curl command is required");
        }
        return importService.importFromCurl(suiteId, curl);
    }

    @PostMapping("/import-json")
    @ResponseStatus(HttpStatus.CREATED)
    public TestStepResponse importJson(@PathVariable UUID suiteId, @RequestBody Map<String, String> body) {
        String json = body.get("json");
        if (json == null || json.isBlank()) {
            throw new IllegalArgumentException("JSON is required");
        }
        return importService.importFromJson(suiteId, json);
    }
}
