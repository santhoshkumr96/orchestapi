package com.orchestrator.service;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RunRegistry {

    private final ConcurrentHashMap<UUID, SseEmitter> activeRuns = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, CompletableFuture<Map<String, String>>> pendingInputs = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, ConcurrentHashMap<String, String>> inputCaches = new ConcurrentHashMap<>();

    /**
     * Register a run with an explicit ID (provided by the caller).
     */
    public void registerRun(UUID runId, SseEmitter emitter) {
        activeRuns.put(runId, emitter);
        inputCaches.put(runId, new ConcurrentHashMap<>());
    }

    /**
     * Unregister a completed/failed run. Cleans up all state.
     */
    public void unregisterRun(UUID runId) {
        activeRuns.remove(runId);
        inputCaches.remove(runId);
        CompletableFuture<Map<String, String>> pending = pendingInputs.remove(runId);
        if (pending != null && !pending.isDone()) {
            pending.completeExceptionally(new RuntimeException("Run cancelled"));
        }
    }

    /**
     * Create a pending input request. Returns a CompletableFuture that the execution
     * thread blocks on. Completed when submitInput is called.
     */
    public CompletableFuture<Map<String, String>> requestInput(UUID runId) {
        CompletableFuture<Map<String, String>> future = new CompletableFuture<>();
        pendingInputs.put(runId, future);
        return future;
    }

    /**
     * Submit manual input values. Completes the pending future so execution resumes.
     */
    public void submitInput(UUID runId, Map<String, String> values) {
        // Cache the values for reuse in later steps
        ConcurrentHashMap<String, String> cache = inputCaches.get(runId);
        if (cache != null) {
            cache.putAll(values);
        }

        CompletableFuture<Map<String, String>> future = pendingInputs.remove(runId);
        if (future != null) {
            future.complete(values);
        }
    }

    /**
     * Cancel a run. Completes the pending future exceptionally.
     * Does NOT close the emitter — the execution thread handles SSE lifecycle.
     */
    public void cancelRun(UUID runId) {
        CompletableFuture<Map<String, String>> future = pendingInputs.remove(runId);
        if (future != null && !future.isDone()) {
            future.completeExceptionally(new RuntimeException("Run cancelled by user"));
        }
    }

    /**
     * Get cached manual input values for a run.
     */
    public Map<String, String> getInputCache(UUID runId) {
        ConcurrentHashMap<String, String> cache = inputCaches.get(runId);
        return cache != null ? cache : Map.of();
    }
}
