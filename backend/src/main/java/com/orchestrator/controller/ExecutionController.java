package com.orchestrator.controller;

import com.orchestrator.dto.ManualInputRequest;
import com.orchestrator.dto.RunRequest;
import com.orchestrator.dto.SuiteExecutionResult;
import com.orchestrator.model.TestRun;
import com.orchestrator.model.enums.TriggerType;
import com.orchestrator.service.ExecutionService;
import com.orchestrator.service.RunRegistry;
import com.orchestrator.service.RunService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/test-suites/{suiteId}")
@RequiredArgsConstructor
@Slf4j
public class ExecutionController {

    private final ExecutionService executionService;
    private final RunRegistry runRegistry;
    private final RunService runService;

    @PostMapping("/run")
    public SuiteExecutionResult runSuite(@PathVariable UUID suiteId,
                                          @RequestBody(required = false) RunRequest request) {
        UUID envId = request != null ? request.getEnvironmentId() : null;

        // Prepare to resolve effective environment
        ExecutionService.PreparedExecution prepared = executionService.prepareSuiteRun(suiteId, envId);
        UUID effectiveEnvId = prepared.env().getId();

        // Persist run
        TestRun testRun = runService.createRun(suiteId, effectiveEnvId, TriggerType.MANUAL, null);
        UUID runId = testRun.getId();

        try {
            SuiteExecutionResult result = executionService.runSuite(suiteId, envId);
            runService.completeRun(runId, result);
            return result;
        } catch (Exception e) {
            runService.failRun(runId, e.getMessage());
            throw e;
        }
    }

    @PostMapping("/steps/{stepId}/run")
    public SuiteExecutionResult runStep(@PathVariable UUID suiteId,
                                         @PathVariable UUID stepId,
                                         @RequestBody(required = false) RunRequest request) {
        UUID envId = request != null ? request.getEnvironmentId() : null;

        // Prepare to resolve effective environment
        ExecutionService.PreparedExecution prepared = executionService.prepareStepRun(suiteId, stepId, envId);
        UUID effectiveEnvId = prepared.env().getId();

        // Persist run
        TestRun testRun = runService.createRun(suiteId, effectiveEnvId, TriggerType.MANUAL, null);
        UUID runId = testRun.getId();

        try {
            SuiteExecutionResult result = executionService.runStep(suiteId, stepId, envId);
            runService.completeRun(runId, result);
            return result;
        } catch (Exception e) {
            runService.failRun(runId, e.getMessage());
            throw e;
        }
    }

    @PostMapping("/run/{runId}/inputs")
    public ResponseEntity<Void> submitManualInput(@PathVariable UUID suiteId,
                                                   @PathVariable UUID runId,
                                                   @RequestBody ManualInputRequest request) {
        runRegistry.submitInput(runId, request.getValues());
        return ResponseEntity.ok().build();
    }

    @PostMapping("/run/{runId}/cancel")
    public ResponseEntity<Void> cancelRun(@PathVariable UUID suiteId,
                                           @PathVariable UUID runId) {
        runRegistry.cancelRun(runId);
        return ResponseEntity.ok().build();
    }

    // ── SSE streaming endpoints ─────────────────────────────────────────

    @GetMapping(value = "/run/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamSuiteRun(@PathVariable UUID suiteId,
                                      @RequestParam(required = false) UUID environmentId) {
        SseEmitter emitter = new SseEmitter(3_600_000L); // 60 min timeout

        // Load all data inside transaction
        ExecutionService.PreparedExecution prepared = executionService.prepareSuiteRun(suiteId, environmentId);
        UUID effectiveEnvId = prepared.env().getId();

        // Persist run to DB
        TestRun testRun = runService.createRun(suiteId, effectiveEnvId, TriggerType.MANUAL, null);
        UUID runId = testRun.getId();

        // Register this run with the persisted ID
        runRegistry.registerRun(runId, emitter);

        // Cancel run if SSE connection times out or client disconnects
        emitter.onTimeout(() -> runRegistry.cancelRun(runId));
        emitter.onCompletion(() -> runRegistry.unregisterRun(runId));

        Thread.ofVirtual().name("sse-suite-" + suiteId).start(() -> {
            try {
                // Send run-started event with the runId
                emitter.send(SseEmitter.event()
                        .name("run-started")
                        .data(Map.of("runId", runId.toString()), MediaType.APPLICATION_JSON));

                SuiteExecutionResult finalResult = executionService.executePrepared(prepared, stepResult -> {
                    try {
                        emitter.send(SseEmitter.event()
                                .name("step")
                                .data(stepResult, MediaType.APPLICATION_JSON));
                    } catch (IOException e) {
                        log.error("Failed to send SSE step event: {}", e.getMessage());
                    }
                }, runId, runRegistry, emitter);

                // Persist completed run
                runService.completeRun(runId, finalResult);

                emitter.send(SseEmitter.event()
                        .name("complete")
                        .data(finalResult, MediaType.APPLICATION_JSON));
                emitter.complete();
            } catch (Exception e) {
                // Persist failed run
                runService.failRun(runId, e.getMessage());

                try {
                    emitter.send(SseEmitter.event()
                            .name("run-error")
                            .data(Map.of("message", e.getMessage() != null ? e.getMessage() : "Unknown error"),
                                    MediaType.APPLICATION_JSON));
                } catch (IOException ignored) {}
                emitter.completeWithError(e);
            } finally {
                runRegistry.unregisterRun(runId);
            }
        });

        return emitter;
    }

    @GetMapping(value = "/steps/{stepId}/run/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamStepRun(@PathVariable UUID suiteId,
                                     @PathVariable UUID stepId,
                                     @RequestParam(required = false) UUID environmentId) {
        SseEmitter emitter = new SseEmitter(300_000L);

        // Load all data inside transaction
        ExecutionService.PreparedExecution prepared = executionService.prepareStepRun(suiteId, stepId, environmentId);
        UUID effectiveEnvId = prepared.env().getId();

        // Persist run to DB
        TestRun testRun = runService.createRun(suiteId, effectiveEnvId, TriggerType.MANUAL, null);
        UUID runId = testRun.getId();

        // Register this run with the persisted ID
        runRegistry.registerRun(runId, emitter);

        // Cancel run if SSE connection times out or client disconnects
        emitter.onTimeout(() -> runRegistry.cancelRun(runId));
        emitter.onCompletion(() -> runRegistry.unregisterRun(runId));

        Thread.ofVirtual().name("sse-step-" + stepId).start(() -> {
            try {
                emitter.send(SseEmitter.event()
                        .name("run-started")
                        .data(Map.of("runId", runId.toString()), MediaType.APPLICATION_JSON));

                SuiteExecutionResult finalResult = executionService.executePrepared(prepared, stepResult -> {
                    try {
                        emitter.send(SseEmitter.event()
                                .name("step")
                                .data(stepResult, MediaType.APPLICATION_JSON));
                    } catch (IOException e) {
                        log.error("Failed to send SSE step event: {}", e.getMessage());
                    }
                }, runId, runRegistry, emitter);

                // Persist completed run
                runService.completeRun(runId, finalResult);

                emitter.send(SseEmitter.event()
                        .name("complete")
                        .data(finalResult, MediaType.APPLICATION_JSON));
                emitter.complete();
            } catch (Exception e) {
                // Persist failed run
                runService.failRun(runId, e.getMessage());

                try {
                    emitter.send(SseEmitter.event()
                            .name("run-error")
                            .data(Map.of("message", e.getMessage() != null ? e.getMessage() : "Unknown error"),
                                    MediaType.APPLICATION_JSON));
                } catch (IOException ignored) {}
                emitter.completeWithError(e);
            } finally {
                runRegistry.unregisterRun(runId);
            }
        });

        return emitter;
    }
}
