package com.orchestrator.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestrator.dto.*;
import com.orchestrator.exception.NotFoundException;
import com.orchestrator.model.*;
import com.orchestrator.model.enums.BodyType;
import com.orchestrator.repository.EnvironmentFileRepository;
import com.orchestrator.repository.EnvironmentRepository;
import com.orchestrator.repository.TestStepRepository;
import com.orchestrator.repository.TestSuiteRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.function.Consumer;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ExecutionService {

    private final TestStepRepository stepRepo;
    private final TestSuiteRepository suiteRepo;
    private final EnvironmentRepository envRepo;
    private final EnvironmentFileRepository fileRepo;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate;
    private final VerificationService verificationService;

    private static final Pattern ENV_VAR_PATTERN = Pattern.compile("\\$\\{([^}]+)}");
    private static final Pattern STEP_VAR_PATTERN = Pattern.compile("\\{\\{([^}]+)}}");
    private static final Pattern MANUAL_INPUT_PATTERN = Pattern.compile("#\\{([^}]+)}");

    /** Pre-loaded execution context (safe to use outside a Hibernate session). */
    public record PreparedExecution(
            List<UUID> executionOrder,
            Map<UUID, TestStep> stepMap,
            Environment env
    ) {}

    // ── Public API ──────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public SuiteExecutionResult runSuite(UUID suiteId, UUID envId) {
        // 1. Load suite
        TestSuite suite = suiteRepo.findById(suiteId)
                .orElseThrow(() -> new NotFoundException("Test suite not found: " + suiteId));

        // 2. Resolve environment
        Environment env = resolveEnvironment(envId, suite.getDefaultEnvironmentId());

        // 3. Load all steps with full details, ordered by sortOrder
        List<TestStep> steps = stepRepo.findBySuiteIdWithDetails(suiteId);
        if (steps.isEmpty()) {
            return SuiteExecutionResult.builder()
                    .status("SUCCESS")
                    .steps(Collections.emptyList())
                    .totalDurationMs(0)
                    .build();
        }

        // Also load verifications + assertions (separate query to avoid Cartesian product)
        mergeVerifications(steps, suiteId);

        // 4. Build the full dependency graph and topologically sort all steps
        Map<UUID, TestStep> stepMap = buildStepMap(steps);
        Map<UUID, Set<UUID>> depGraph = buildDependencyGraph(steps);
        List<UUID> executionOrder = topologicalSortAll(steps, depGraph);

        // Filter out dependency-only steps — they'll be executed on-demand by dependents
        executionOrder = executionOrder.stream()
                .filter(id -> !stepMap.get(id).isDependencyOnly())
                .toList();

        // 5. Execute steps in order
        return executeSteps(executionOrder, stepMap, env);
    }

    @Transactional(readOnly = true)
    public SuiteExecutionResult runStep(UUID suiteId, UUID stepId, UUID envId) {
        // 1. Load suite and target step
        TestSuite suite = suiteRepo.findById(suiteId)
                .orElseThrow(() -> new NotFoundException("Test suite not found: " + suiteId));

        // 2. Resolve environment
        Environment env = resolveEnvironment(envId, suite.getDefaultEnvironmentId());

        // 3. Load all steps (needed for dependency resolution)
        List<TestStep> allSteps = stepRepo.findBySuiteIdWithDetails(suiteId);
        // Also load verifications + assertions (separate query to avoid Cartesian product)
        mergeVerifications(allSteps, suiteId);
        Map<UUID, TestStep> stepMap = buildStepMap(allSteps);

        if (!stepMap.containsKey(stepId)) {
            throw new NotFoundException("Test step " + stepId + " not found in suite " + suiteId);
        }

        // 4. Build dependency graph for all steps
        Map<UUID, Set<UUID>> depGraph = buildDependencyGraph(allSteps);

        // 5. Find subgraph: all transitive dependencies of the target step
        List<UUID> executionOrder = topologicalSortSubgraph(stepId, depGraph);

        // 6. Execute only the subgraph steps
        return executeSteps(executionOrder, stepMap, env);
    }

    // ── SSE streaming preparation ───────────────────────────────────────

    /** Load all data for a suite run inside a transaction (safe for use outside Hibernate session). */
    @Transactional(readOnly = true)
    public PreparedExecution prepareSuiteRun(UUID suiteId, UUID envId) {
        TestSuite suite = suiteRepo.findById(suiteId)
                .orElseThrow(() -> new NotFoundException("Test suite not found: " + suiteId));
        Environment env = resolveEnvironment(envId, suite.getDefaultEnvironmentId());
        List<TestStep> steps = stepRepo.findBySuiteIdWithDetails(suiteId);
        if (steps.isEmpty()) {
            return new PreparedExecution(Collections.emptyList(), Collections.emptyMap(), env);
        }
        // Also load verifications + assertions (separate query to avoid Cartesian product)
        mergeVerifications(steps, suiteId);
        Map<UUID, TestStep> stepMap = buildStepMap(steps);
        Map<UUID, Set<UUID>> depGraph = buildDependencyGraph(steps);
        List<UUID> executionOrder = topologicalSortAll(steps, depGraph);

        // Filter out dependency-only steps — they'll be executed on-demand by dependents
        executionOrder = executionOrder.stream()
                .filter(id -> !stepMap.get(id).isDependencyOnly())
                .toList();

        return new PreparedExecution(executionOrder, stepMap, env);
    }

    /** Load all data for a single step run inside a transaction. */
    @Transactional(readOnly = true)
    public PreparedExecution prepareStepRun(UUID suiteId, UUID stepId, UUID envId) {
        TestSuite suite = suiteRepo.findById(suiteId)
                .orElseThrow(() -> new NotFoundException("Test suite not found: " + suiteId));
        Environment env = resolveEnvironment(envId, suite.getDefaultEnvironmentId());
        List<TestStep> allSteps = stepRepo.findBySuiteIdWithDetails(suiteId);
        // Also load verifications + assertions (separate query to avoid Cartesian product)
        mergeVerifications(allSteps, suiteId);
        Map<UUID, TestStep> stepMap = buildStepMap(allSteps);
        if (!stepMap.containsKey(stepId)) {
            throw new NotFoundException("Test step " + stepId + " not found in suite " + suiteId);
        }
        Map<UUID, Set<UUID>> depGraph = buildDependencyGraph(allSteps);
        List<UUID> executionOrder = topologicalSortSubgraph(stepId, depGraph);
        return new PreparedExecution(executionOrder, stepMap, env);
    }

    /** Execute a prepared run, optionally streaming each step result via callback. */
    public SuiteExecutionResult executePrepared(PreparedExecution prepared,
                                                 Consumer<StepExecutionResult> onStepComplete) {
        if (prepared.executionOrder().isEmpty()) {
            return SuiteExecutionResult.builder()
                    .status("SUCCESS")
                    .steps(Collections.emptyList())
                    .totalDurationMs(0)
                    .build();
        }
        return executeSteps(prepared.executionOrder(), prepared.stepMap(), prepared.env(), onStepComplete);
    }

    /** Execute a prepared run with manual input support (SSE streaming). */
    public SuiteExecutionResult executePrepared(PreparedExecution prepared,
                                                 Consumer<StepExecutionResult> onStepComplete,
                                                 UUID runId,
                                                 RunRegistry runRegistry,
                                                 SseEmitter emitter) {
        if (prepared.executionOrder().isEmpty()) {
            return SuiteExecutionResult.builder()
                    .status("SUCCESS")
                    .steps(Collections.emptyList())
                    .totalDurationMs(0)
                    .build();
        }
        return executeSteps(prepared.executionOrder(), prepared.stepMap(), prepared.env(), onStepComplete, runId, runRegistry, emitter);
    }

    // ── Non-interactive execution (for scheduled runs) ─────────────────

    /**
     * Execute a prepared run non-interactively (for scheduled runs).
     * Manual inputs #{name:default} are resolved using defaults.
     * Steps with #{name} (no default) are SKIPPED.
     */
    public SuiteExecutionResult executePreparedNonInteractive(PreparedExecution prepared) {
        if (prepared.executionOrder().isEmpty()) {
            return SuiteExecutionResult.builder()
                    .status("SUCCESS").steps(Collections.emptyList()).totalDurationMs(0).build();
        }

        long suiteStart = System.currentTimeMillis();
        Map<UUID, StepExecutionResult> resultCache = new LinkedHashMap<>();
        Map<UUID, Long> executedAt = new LinkedHashMap<>();
        Map<String, String> allExtractedVars = new LinkedHashMap<>();
        Set<UUID> refreshedSteps = new HashSet<>();

        // Build default values map from all steps' manual input placeholders
        Map<String, String> defaultInputValues = new LinkedHashMap<>();
        Set<String> unresolvableInputs = new HashSet<>();

        for (UUID stepId : prepared.executionOrder()) {
            TestStep step = prepared.stepMap().get(stepId);
            if (step == null) continue;
            collectManualInputDefaults(step, defaultInputValues, unresolvableInputs);
        }
        // Also collect from dependency-only steps
        for (TestStep step : prepared.stepMap().values()) {
            collectManualInputDefaults(step, defaultInputValues, unresolvableInputs);
        }

        for (UUID stepId : prepared.executionOrder()) {
            TestStep step = prepared.stepMap().get(stepId);
            if (step == null) continue;

            // Check if this step requires unresolvable manual input
            if (stepRequiresUnresolvableInput(step, defaultInputValues)) {
                StepExecutionResult skipResult = StepExecutionResult.builder()
                        .stepId(step.getId())
                        .stepName(step.getName())
                        .status("SKIPPED")
                        .durationMs(0)
                        .errorMessage("Manual input required but no default provided (scheduled run)")
                        .extractedVariables(Collections.emptyMap())
                        .build();
                resultCache.put(stepId, skipResult);
                continue;
            }

            // Execute missing dependencies (without SSE)
            executeMissingDependenciesNonInteractive(step, prepared.stepMap(), prepared.env(),
                    resultCache, executedAt, allExtractedVars, defaultInputValues, suiteStart);

            // Refresh expired dependencies (without SSE)
            refreshExpiredDependenciesNonInteractive(step, prepared.stepMap(), prepared.env(),
                    resultCache, executedAt, allExtractedVars, refreshedSteps, defaultInputValues, suiteStart);

            // Start pre-listeners
            Map<StepVerification, CompletableFuture<String>> preListeners =
                    verificationService.startPreListeners(step.getVerifications(), prepared.env(), allExtractedVars, this);
            if (!preListeners.isEmpty()) {
                try { Thread.sleep(500); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            }

            // Execute the HTTP call with default input values
            StepExecutionResult result = executeStep(step, prepared.env(), resultCache, allExtractedVars, prepared.stepMap(), defaultInputValues);

            if (result.getExtractedVariables() != null) {
                allExtractedVars.putAll(result.getExtractedVariables());
            }

            // Run verifications
            if (step.getVerifications() != null && !step.getVerifications().isEmpty()
                    && !"ERROR".equals(result.getStatus()) && !"SKIPPED".equals(result.getStatus())) {
                List<VerificationResultDto> verResults = verificationService.runVerifications(
                        step.getVerifications(), prepared.env(), allExtractedVars, preListeners, this);
                result.setVerificationResults(verResults);
                if ("SUCCESS".equals(result.getStatus()) || "RETRIED".equals(result.getStatus())) {
                    boolean anyVerFailed = verResults.stream().anyMatch(v -> !"PASS".equals(v.getStatus()));
                    if (anyVerFailed) result.setStatus("VERIFICATION_FAILED");
                }
            }

            if (step.isCacheable()) result.setFromCache(true);
            resultCache.put(stepId, result);
            executedAt.put(stepId, System.currentTimeMillis());
        }

        // Build final results
        List<StepExecutionResult> results = new ArrayList<>();
        for (UUID stepId : prepared.executionOrder()) {
            StepExecutionResult r = resultCache.get(stepId);
            if (r != null) results.add(r);
        }

        long totalMs = System.currentTimeMillis() - suiteStart;
        boolean anyError = results.stream().anyMatch(r -> "ERROR".equals(r.getStatus()));
        boolean anyVerFailed = results.stream().anyMatch(r -> "VERIFICATION_FAILED".equals(r.getStatus()));
        boolean anySuccess = results.stream().anyMatch(r -> "SUCCESS".equals(r.getStatus()) || "RETRIED".equals(r.getStatus()));

        String overallStatus;
        if (!anyError && !anyVerFailed) overallStatus = "SUCCESS";
        else if (anySuccess) overallStatus = "PARTIAL_FAILURE";
        else overallStatus = "FAILURE";

        return SuiteExecutionResult.builder()
                .status(overallStatus).steps(results).totalDurationMs(totalMs).build();
    }

    // ── Non-interactive helpers ───────────────────────────────────────────

    private void collectManualInputDefaults(TestStep step, Map<String, String> defaults, Set<String> unresolvable) {
        String[] texts = { step.getUrl(), step.getBody(), step.getHeaders(), step.getQueryParams() };
        for (String text : texts) {
            if (text == null || text.isEmpty()) continue;
            Matcher matcher = MANUAL_INPUT_PATTERN.matcher(text);
            while (matcher.find()) {
                String content = matcher.group(1);
                int colonIdx = content.indexOf(':');
                if (colonIdx > 0) {
                    String name = content.substring(0, colonIdx);
                    String defaultValue = content.substring(colonIdx + 1);
                    defaults.putIfAbsent(name, defaultValue);
                } else {
                    unresolvable.add(content);
                }
            }
        }
    }

    private boolean stepRequiresUnresolvableInput(TestStep step, Map<String, String> defaults) {
        String[] texts = { step.getUrl(), step.getBody(), step.getHeaders(), step.getQueryParams() };
        for (String text : texts) {
            if (text == null || text.isEmpty()) continue;
            Matcher matcher = MANUAL_INPUT_PATTERN.matcher(text);
            while (matcher.find()) {
                String content = matcher.group(1);
                int colonIdx = content.indexOf(':');
                String name = colonIdx > 0 ? content.substring(0, colonIdx) : content;
                if (colonIdx <= 0 && !defaults.containsKey(name)) return true;
            }
        }
        return false;
    }

    private void executeMissingDependenciesNonInteractive(TestStep step, Map<UUID, TestStep> stepMap,
            Environment env, Map<UUID, StepExecutionResult> resultCache, Map<UUID, Long> executedAt,
            Map<String, String> allExtractedVars, Map<String, String> defaultInputValues, long suiteStart) {
        if (step.getDependencies() == null) return;
        for (StepDependency dep : step.getDependencies()) {
            UUID depId = dep.getDependsOnStepId();
            if (resultCache.containsKey(depId)) continue;
            TestStep depStep = stepMap.get(depId);
            if (depStep == null) continue;

            // Recursively ensure this dep's own deps are executed first
            executeMissingDependenciesNonInteractive(depStep, stepMap, env, resultCache, executedAt,
                    allExtractedVars, defaultInputValues, suiteStart);

            // Check if dep step requires unresolvable manual input
            if (stepRequiresUnresolvableInput(depStep, defaultInputValues)) {
                StepExecutionResult skipResult = StepExecutionResult.builder()
                        .stepId(depStep.getId()).stepName(depStep.getName()).status("SKIPPED")
                        .durationMs(0).errorMessage("Manual input required but no default provided (scheduled run)")
                        .extractedVariables(Collections.emptyMap()).build();
                resultCache.put(depId, skipResult);
                continue;
            }

            // Execute the dep step with default input values
            StepExecutionResult result = executeStep(depStep, env, resultCache, allExtractedVars, stepMap, defaultInputValues);
            if (result.getExtractedVariables() != null) {
                allExtractedVars.putAll(result.getExtractedVariables());
            }
            resultCache.put(depId, result);
            executedAt.put(depId, System.currentTimeMillis());
        }
    }

    private void refreshExpiredDependenciesNonInteractive(TestStep step, Map<UUID, TestStep> stepMap,
            Environment env, Map<UUID, StepExecutionResult> resultCache, Map<UUID, Long> executedAt,
            Map<String, String> allExtractedVars, Set<UUID> refreshedSteps,
            Map<String, String> defaultInputValues, long suiteStart) {
        if (step.getDependencies() == null) return;

        for (StepDependency dep : step.getDependencies()) {
            UUID depId = dep.getDependsOnStepId();
            TestStep depStep = stepMap.get(depId);
            if (depStep == null) continue;

            Long depExecTime = executedAt.get(depId);
            if (depExecTime == null) continue; // not executed yet

            boolean needsRefresh = false;
            String reason = "";

            // useCache=false on dependency -> always re-execute
            if (!dep.isUseCache()) {
                needsRefresh = true;
                reason = "useCache=false";
            }
            // cacheable with positive TTL -> check if expired
            else if (depStep.isCacheable() && depStep.getCacheTtlSeconds() > 0) {
                long elapsedSeconds = (System.currentTimeMillis() - depExecTime) / 1000;
                if (elapsedSeconds >= depStep.getCacheTtlSeconds()) {
                    needsRefresh = true;
                    reason = elapsedSeconds + "s elapsed > " + depStep.getCacheTtlSeconds() + "s TTL";
                }
            }

            if (!needsRefresh) continue;

            log.info("Non-interactive: Dependency '{}' needs refresh ({}), re-executing", depStep.getName(), reason);

            // Recursively refresh this dep's own expired dependencies first
            refreshExpiredDependenciesNonInteractive(depStep, stepMap, env, resultCache, executedAt,
                    allExtractedVars, refreshedSteps, defaultInputValues, suiteStart);

            // Re-execute the dependency with default input values
            StepExecutionResult freshResult = executeStep(depStep, env, resultCache, allExtractedVars, stepMap, defaultInputValues);
            freshResult.setFromCache(false);
            resultCache.put(depId, freshResult);
            executedAt.put(depId, System.currentTimeMillis());
            refreshedSteps.add(depId);

            if (freshResult.getExtractedVariables() != null) {
                allExtractedVars.putAll(freshResult.getExtractedVariables());
            }
        }
    }

    // ── Environment resolution ──────────────────────────────────────────

    private Environment resolveEnvironment(UUID overrideEnvId, UUID defaultEnvId) {
        UUID envId = overrideEnvId != null ? overrideEnvId : defaultEnvId;
        if (envId == null) {
            return null; // No environment — no variable substitution
        }
        Environment env = envRepo.findByIdWithDetails(envId)
                .orElseThrow(() -> new NotFoundException("Environment not found: " + envId));

        // Also load connectors (needed for verification execution)
        envRepo.findByIdWithConnectors(envId).ifPresent(ec -> env.setConnectors(ec.getConnectors()));

        return env;
    }

    // ── cURL generation ─────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public String generateCurl(UUID suiteId, UUID stepId, UUID envId) {
        TestStep step = stepRepo.findByIdWithDetails(stepId)
                .orElseThrow(() -> new NotFoundException("Test step not found: " + stepId));
        if (!step.getSuite().getId().equals(suiteId)) {
            throw new NotFoundException("Step does not belong to suite");
        }

        Environment env = resolveEnvironment(envId, step.getSuite().getDefaultEnvironmentId());

        Map<String, String> emptyVars = Collections.emptyMap();
        Map<String, String> emptyInputs = Collections.emptyMap();

        // Resolve URL
        String url = resolvePlaceholders(step.getUrl(), env, emptyVars);
        url = resolveManualInputs(url, emptyInputs);
        if (url.startsWith("/") && env != null && env.getBaseUrl() != null && !env.getBaseUrl().isEmpty()) {
            String baseUrl = env.getBaseUrl();
            if (baseUrl.endsWith("/")) baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
            url = baseUrl + url;
        }

        // Resolve query params
        List<KeyValuePair> queryParams = parseKeyValuePairs(step.getQueryParams());
        if (!queryParams.isEmpty()) {
            StringBuilder qs = new StringBuilder();
            for (KeyValuePair kv : queryParams) {
                String key = resolvePlaceholders(kv.getKey(), env, emptyVars);
                key = resolveManualInputs(key, emptyInputs);
                String value = resolvePlaceholders(kv.getValue(), env, emptyVars);
                value = resolveManualInputs(value, emptyInputs);
                if (qs.length() > 0) qs.append("&");
                qs.append(key).append("=").append(value);
            }
            url += (url.contains("?") ? "&" : "?") + qs;
        }

        // Build and resolve headers
        HttpHeaders httpHeaders = buildHeaders(step, env, emptyVars, emptyInputs);

        // Build cURL
        StringBuilder curl = new StringBuilder("curl -X ").append(step.getMethod().name());

        httpHeaders.forEach((key, values) -> {
            if (values != null) {
                for (String value : values) {
                    curl.append(" \\\n  -H '").append(key).append(": ")
                            .append(value.replace("'", "'\\''")).append("'");
                }
            }
        });

        // Resolve body
        if (step.getBodyType() == BodyType.FORM_DATA) {
            String fieldsJson = step.getFormDataFields();
            if (fieldsJson != null && !fieldsJson.isBlank() && !"[]".equals(fieldsJson)) {
                try {
                    List<FormDataFieldDto> fields = objectMapper.readValue(fieldsJson,
                            new TypeReference<List<FormDataFieldDto>>() {});
                    for (FormDataFieldDto field : fields) {
                        String val = resolvePlaceholders(field.getValue(), env, emptyVars);
                        val = resolveManualInputs(val, emptyInputs);
                        if ("file".equals(field.getType())) {
                            curl.append(" \\\n  -F '").append(field.getKey())
                                    .append("=@").append(val.replace("'", "'\\''")).append("'");
                        } else {
                            curl.append(" \\\n  -F '").append(field.getKey())
                                    .append("=").append(val.replace("'", "'\\''")).append("'");
                        }
                    }
                } catch (JsonProcessingException ignored) {}
            }
        } else if (step.getBodyType() != BodyType.NONE) {
            String body = resolvePlaceholders(step.getBody(), env, emptyVars);
            body = resolveManualInputs(body, emptyInputs);
            if (body != null && !body.isEmpty()) {
                curl.append(" \\\n  -d '").append(body.replace("'", "'\\''")).append("'");
            }
        }

        curl.append(" \\\n  '").append(url).append("'");
        return curl.toString();
    }

    // ── Graph utilities ─────────────────────────────────────────────────

    private Map<UUID, TestStep> buildStepMap(List<TestStep> steps) {
        Map<UUID, TestStep> map = new LinkedHashMap<>();
        for (TestStep step : steps) {
            map.put(step.getId(), step);
        }
        return map;
    }

    /**
     * Load verifications + assertions in a separate query (avoids Cartesian product with
     * dependencies/responseHandlers/extractVariables) and merge them into the already-loaded steps.
     */
    private void mergeVerifications(List<TestStep> steps, UUID suiteId) {
        List<TestStep> withVer = stepRepo.findBySuiteIdWithVerifications(suiteId);
        Map<UUID, Set<StepVerification>> verMap = new HashMap<>();
        for (TestStep sv : withVer) {
            verMap.put(sv.getId(), sv.getVerifications());
        }
        for (TestStep step : steps) {
            Set<StepVerification> vers = verMap.get(step.getId());
            if (vers != null) {
                step.setVerifications(vers);
            }
        }
    }

    /**
     * Build adjacency: stepId -> set of stepIds it depends on.
     */
    private Map<UUID, Set<UUID>> buildDependencyGraph(List<TestStep> steps) {
        Map<UUID, Set<UUID>> graph = new HashMap<>();
        for (TestStep step : steps) {
            Set<UUID> deps = new LinkedHashSet<>();
            if (step.getDependencies() != null) {
                for (StepDependency d : step.getDependencies()) {
                    deps.add(d.getDependsOnStepId());
                }
            }
            graph.put(step.getId(), deps);
        }
        return graph;
    }

    /**
     * Kahn's algorithm for all steps — topological sort respecting dependencies.
     * Falls back to sortOrder among steps at the same "level".
     */
    private List<UUID> topologicalSortAll(List<TestStep> steps, Map<UUID, Set<UUID>> depGraph) {
        // in-degree map
        Map<UUID, Integer> inDegree = new HashMap<>();
        for (TestStep s : steps) {
            inDegree.put(s.getId(), 0);
        }
        for (Map.Entry<UUID, Set<UUID>> entry : depGraph.entrySet()) {
            // entry.key depends on entry.value steps
            inDegree.put(entry.getKey(), entry.getValue().size());
        }

        // Map for sortOrder tiebreaking
        Map<UUID, Integer> sortOrderMap = new HashMap<>();
        for (TestStep s : steps) {
            sortOrderMap.put(s.getId(), s.getSortOrder());
        }

        // Priority queue ordered by sortOrder for deterministic execution
        PriorityQueue<UUID> queue = new PriorityQueue<>(
                Comparator.comparingInt(id -> sortOrderMap.getOrDefault(id, Integer.MAX_VALUE))
        );

        for (Map.Entry<UUID, Integer> entry : inDegree.entrySet()) {
            if (entry.getValue() == 0) {
                queue.add(entry.getKey());
            }
        }

        List<UUID> result = new ArrayList<>();
        while (!queue.isEmpty()) {
            UUID current = queue.poll();
            result.add(current);

            // Decrease in-degree for steps that depend on 'current'
            for (Map.Entry<UUID, Set<UUID>> entry : depGraph.entrySet()) {
                if (entry.getValue().contains(current)) {
                    int newDeg = inDegree.get(entry.getKey()) - 1;
                    inDegree.put(entry.getKey(), newDeg);
                    if (newDeg == 0) {
                        queue.add(entry.getKey());
                    }
                }
            }
        }

        return result;
    }

    /**
     * BFS backwards from targetStepId to collect all transitive dependencies,
     * then topological sort the subgraph.
     */
    private List<UUID> topologicalSortSubgraph(UUID targetStepId, Map<UUID, Set<UUID>> depGraph) {
        // 1. Collect all needed step IDs by walking backwards from the target
        Set<UUID> needed = new LinkedHashSet<>();
        Deque<UUID> queue = new ArrayDeque<>();
        queue.add(targetStepId);
        needed.add(targetStepId);

        while (!queue.isEmpty()) {
            UUID current = queue.poll();
            Set<UUID> deps = depGraph.getOrDefault(current, Collections.emptySet());
            for (UUID dep : deps) {
                if (needed.add(dep)) {
                    queue.add(dep);
                }
            }
        }

        // 2. Topological sort only the needed subset (Kahn's)
        Map<UUID, Integer> inDegree = new HashMap<>();
        for (UUID id : needed) {
            inDegree.put(id, 0);
        }
        for (UUID id : needed) {
            Set<UUID> deps = depGraph.getOrDefault(id, Collections.emptySet());
            for (UUID dep : deps) {
                if (needed.contains(dep)) {
                    inDegree.merge(id, 1, Integer::sum);
                }
            }
        }

        // Reset and recount properly
        for (UUID id : needed) {
            int count = 0;
            Set<UUID> deps = depGraph.getOrDefault(id, Collections.emptySet());
            for (UUID dep : deps) {
                if (needed.contains(dep)) {
                    count++;
                }
            }
            inDegree.put(id, count);
        }

        Deque<UUID> readyQueue = new ArrayDeque<>();
        for (UUID id : needed) {
            if (inDegree.get(id) == 0) {
                readyQueue.add(id);
            }
        }

        List<UUID> result = new ArrayList<>();
        while (!readyQueue.isEmpty()) {
            UUID current = readyQueue.poll();
            result.add(current);

            for (UUID id : needed) {
                Set<UUID> deps = depGraph.getOrDefault(id, Collections.emptySet());
                if (deps.contains(current)) {
                    int newDeg = inDegree.get(id) - 1;
                    inDegree.put(id, newDeg);
                    if (newDeg == 0) {
                        readyQueue.add(id);
                    }
                }
            }
        }

        return result;
    }

    // ── Step execution orchestration ────────────────────────────────────

    private SuiteExecutionResult executeSteps(List<UUID> executionOrder,
                                               Map<UUID, TestStep> stepMap,
                                               Environment env) {
        return executeSteps(executionOrder, stepMap, env, null);
    }

    private SuiteExecutionResult executeSteps(List<UUID> executionOrder,
                                               Map<UUID, TestStep> stepMap,
                                               Environment env,
                                               Consumer<StepExecutionResult> onStepComplete) {
        return executeSteps(executionOrder, stepMap, env, onStepComplete, null, null, null);
    }

    private SuiteExecutionResult executeSteps(List<UUID> executionOrder,
                                               Map<UUID, TestStep> stepMap,
                                               Environment env,
                                               Consumer<StepExecutionResult> onStepComplete,
                                               UUID runId,
                                               RunRegistry runRegistry,
                                               SseEmitter emitter) {
        long suiteStart = System.currentTimeMillis();

        Map<UUID, StepExecutionResult> resultCache = new LinkedHashMap<>();
        Map<UUID, Long> executedAt = new LinkedHashMap<>(); // when each step last executed
        Map<String, String> allExtractedVars = new LinkedHashMap<>();
        Set<UUID> refreshedSteps = new HashSet<>(); // steps re-executed due to TTL expiry

        for (UUID stepId : executionOrder) {
            TestStep step = stepMap.get(stepId);
            if (step == null) continue;

            // Execute any dependencies not yet in resultCache (dependency-only steps)
            executeMissingDependencies(step, stepMap, env, resultCache, executedAt,
                    allExtractedVars, runId, runRegistry, emitter, suiteStart, onStepComplete);

            // Re-execute any dependencies whose cache TTL has expired
            refreshExpiredDependencies(step, stepMap, env, resultCache, executedAt, allExtractedVars, refreshedSteps,
                    runId, runRegistry, emitter, suiteStart, onStepComplete);

            // Start pre-listeners BEFORE HTTP call (for Kafka/RabbitMQ verifications)
            Map<StepVerification, CompletableFuture<String>> preListeners =
                    verificationService.startPreListeners(step.getVerifications(), env, allExtractedVars, this);

            // Brief pause to let pre-listeners establish connections and position at end of stream
            if (!preListeners.isEmpty()) {
                try { Thread.sleep(500); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            }

            // Check for manual input placeholders in step's texts
            if (runId != null && runRegistry != null && emitter != null) {
                String resolvedUrl = resolvePlaceholders(step.getUrl(), env, allExtractedVars);
                String resolvedBody = resolvePlaceholders(step.getBody(), env, allExtractedVars);
                // Collect all header values and query param values
                List<String> allTexts = new ArrayList<>();
                allTexts.add(resolvedUrl);
                allTexts.add(resolvedBody);
                List<KeyValuePair> qps = parseKeyValuePairs(step.getQueryParams());
                for (KeyValuePair kv : qps) {
                    allTexts.add(resolvePlaceholders(kv.getValue(), env, allExtractedVars));
                }
                List<KeyValuePair> hds = parseKeyValuePairs(step.getHeaders());
                for (KeyValuePair kv : hds) {
                    allTexts.add(resolvePlaceholders(kv.getValue(), env, allExtractedVars));
                }

                Map<String, String> inputCache = runRegistry.getInputCache(runId);
                List<ManualInputField> requiredFields = extractManualInputFields(inputCache, allTexts.toArray(new String[0]));

                if (!requiredFields.isEmpty()) {
                    try {
                        // Emit SSE event to request input
                        Map<String, Object> inputEvent = new LinkedHashMap<>();
                        inputEvent.put("runId", runId.toString());
                        inputEvent.put("stepId", step.getId().toString());
                        inputEvent.put("stepName", step.getName());
                        inputEvent.put("fields", requiredFields);
                        emitter.send(SseEmitter.event()
                                .name("input-required")
                                .data(inputEvent, MediaType.APPLICATION_JSON));

                        // Block until input is provided (values already cached by RunRegistry.submitInput)
                        CompletableFuture<Map<String, String>> inputFuture = runRegistry.requestInput(runId);
                        inputFuture.join(); // blocks virtual thread until input submitted or run cancelled
                    } catch (Exception e) {
                        log.error("Manual input failed for step '{}': {}", step.getName(), e.getMessage());
                        StepExecutionResult cancelResult = StepExecutionResult.builder()
                                .stepId(step.getId())
                                .stepName(step.getName())
                                .status("ERROR")
                                .durationMs(System.currentTimeMillis() - suiteStart)
                                .errorMessage("Run cancelled: " + e.getMessage())
                                .extractedVariables(Collections.emptyMap())
                                .build();
                        resultCache.put(stepId, cancelResult);
                        if (onStepComplete != null) onStepComplete.accept(cancelResult);
                        break; // stop ALL remaining steps on cancel
                    }
                }
            }

            // Execute the HTTP call
            Map<String, String> manualInputValues = runId != null && runRegistry != null
                    ? runRegistry.getInputCache(runId) : Collections.emptyMap();
            StepExecutionResult result = executeStep(step, env, resultCache, allExtractedVars, stepMap, manualInputValues);

            // Merge extracted variables BEFORE verifications so self-referencing works
            // e.g. {{Create User.userId}} in a verification query on the Create User step
            if (result.getExtractedVariables() != null) {
                allExtractedVars.putAll(result.getExtractedVariables());
            }

            // Run verifications AFTER HTTP call (if step didn't error/skip)
            if (step.getVerifications() != null && !step.getVerifications().isEmpty()
                    && !"ERROR".equals(result.getStatus()) && !"SKIPPED".equals(result.getStatus())) {
                List<VerificationResultDto> verResults = verificationService.runVerifications(
                        step.getVerifications(), env, allExtractedVars, preListeners, this);
                result.setVerificationResults(verResults);

                // Adjust status if verification failed
                if ("SUCCESS".equals(result.getStatus()) || "RETRIED".equals(result.getStatus())) {
                    boolean anyVerFailed = verResults.stream().anyMatch(v -> !"PASS".equals(v.getStatus()));
                    if (anyVerFailed) {
                        result.setStatus("VERIFICATION_FAILED");
                    }
                }
            }

            // Cacheable steps that haven't been re-executed: mark as fromCache=true
            // (their result is valid within TTL for all dependents)
            if (step.isCacheable()) {
                result.setFromCache(true);
            }

            resultCache.put(stepId, result);
            executedAt.put(stepId, System.currentTimeMillis());

            // Notify streaming listener
            if (onStepComplete != null) {
                onStepComplete.accept(result);
            }
        }

        // Build final results from resultCache (re-executed steps have latest result)
        List<StepExecutionResult> results = new ArrayList<>();
        for (UUID stepId : executionOrder) {
            StepExecutionResult r = resultCache.get(stepId);
            if (r != null) results.add(r);
        }

        long totalMs = System.currentTimeMillis() - suiteStart;

        // Determine overall status
        boolean anyError = results.stream().anyMatch(r -> "ERROR".equals(r.getStatus()));
        boolean anyVerFailed = results.stream().anyMatch(r -> "VERIFICATION_FAILED".equals(r.getStatus()));
        boolean anySuccess = results.stream().anyMatch(r ->
                "SUCCESS".equals(r.getStatus()) || "RETRIED".equals(r.getStatus()));

        String overallStatus;
        if (!anyError && !anyVerFailed) {
            overallStatus = "SUCCESS";
        } else if (anySuccess) {
            overallStatus = "PARTIAL_FAILURE";
        } else {
            overallStatus = "FAILURE";
        }

        return SuiteExecutionResult.builder()
                .status(overallStatus)
                .steps(results)
                .totalDurationMs(totalMs)
                .build();
    }

    // ── On-demand execution of dependency-only steps ──────────────────

    /**
     * Before executing a step, ensure all its dependencies are in resultCache.
     * If a dependency is missing (because it was dependency-only and filtered
     * from the execution order), execute it recursively.
     */
    private void executeMissingDependencies(TestStep step,
                                             Map<UUID, TestStep> stepMap,
                                             Environment env,
                                             Map<UUID, StepExecutionResult> resultCache,
                                             Map<UUID, Long> executedAt,
                                             Map<String, String> allExtractedVars,
                                             UUID runId, RunRegistry runRegistry, SseEmitter emitter,
                                             long suiteStart,
                                             Consumer<StepExecutionResult> onStepComplete) {
        if (step.getDependencies() == null) return;
        for (StepDependency dep : step.getDependencies()) {
            UUID depId = dep.getDependsOnStepId();
            if (resultCache.containsKey(depId)) continue; // already executed
            TestStep depStep = stepMap.get(depId);
            if (depStep == null) continue;
            // Recursively ensure this dep's own deps are executed first
            executeMissingDependencies(depStep, stepMap, env, resultCache, executedAt,
                    allExtractedVars, runId, runRegistry, emitter, suiteStart, onStepComplete);
            // Handle manual input for the dep step
            Map<String, String> manualInputValues = Collections.emptyMap();
            if (runId != null && runRegistry != null && emitter != null) {
                manualInputValues = runRegistry.getInputCache(runId);
                // Check for manual input placeholders
                String resolvedUrl = resolvePlaceholders(depStep.getUrl(), env, allExtractedVars);
                String resolvedBody = resolvePlaceholders(depStep.getBody(), env, allExtractedVars);
                List<String> allTexts = new ArrayList<>();
                allTexts.add(resolvedUrl);
                allTexts.add(resolvedBody);
                for (KeyValuePair kv : parseKeyValuePairs(depStep.getQueryParams())) {
                    allTexts.add(resolvePlaceholders(kv.getValue(), env, allExtractedVars));
                }
                for (KeyValuePair kv : parseKeyValuePairs(depStep.getHeaders())) {
                    allTexts.add(resolvePlaceholders(kv.getValue(), env, allExtractedVars));
                }

                Map<String, String> inputCache = runRegistry.getInputCache(runId);
                List<ManualInputField> requiredFields = extractManualInputFields(inputCache, allTexts.toArray(new String[0]));
                if (!requiredFields.isEmpty()) {
                    try {
                        Map<String, Object> inputEvent = new LinkedHashMap<>();
                        inputEvent.put("runId", runId.toString());
                        inputEvent.put("stepId", depStep.getId().toString());
                        inputEvent.put("stepName", depStep.getName());
                        inputEvent.put("fields", requiredFields);
                        emitter.send(SseEmitter.event()
                                .name("input-required")
                                .data(inputEvent, MediaType.APPLICATION_JSON));
                        CompletableFuture<Map<String, String>> inputFuture = runRegistry.requestInput(runId);
                        inputFuture.join();
                    } catch (Exception e) {
                        log.error("Manual input for dep-only step '{}' failed: {}", depStep.getName(), e.getMessage());
                    }
                }
                manualInputValues = runRegistry.getInputCache(runId);
            }
            // Execute the dep step
            StepExecutionResult result = executeStep(depStep, env, resultCache, allExtractedVars, stepMap, manualInputValues);
            resultCache.put(depId, result);
            executedAt.put(depId, System.currentTimeMillis());
            if (result.getExtractedVariables() != null) {
                allExtractedVars.putAll(result.getExtractedVariables());
            }
            if (onStepComplete != null) onStepComplete.accept(result);
        }
    }

    // ── Within-run cache TTL refresh ────────────────────────────────────

    /**
     * Before executing a step, check if any of its dependencies have expired
     * (cacheable + cacheTtlSeconds > 0 + elapsed time > TTL). If so, re-execute
     * them to get fresh data (e.g., a new auth token).
     */
    private void refreshExpiredDependencies(TestStep step,
                                             Map<UUID, TestStep> stepMap,
                                             Environment env,
                                             Map<UUID, StepExecutionResult> resultCache,
                                             Map<UUID, Long> executedAt,
                                             Map<String, String> allExtractedVars,
                                             Set<UUID> refreshedSteps,
                                             UUID runId,
                                             RunRegistry runRegistry,
                                             SseEmitter emitter,
                                             long suiteStart,
                                             Consumer<StepExecutionResult> onStepComplete) {
        if (step.getDependencies() == null) return;

        for (StepDependency dep : step.getDependencies()) {
            UUID depId = dep.getDependsOnStepId();
            TestStep depStep = stepMap.get(depId);
            if (depStep == null) continue;

            Long depExecTime = executedAt.get(depId);
            if (depExecTime == null) continue; // not executed yet, will run in topo order

            boolean needsRefresh = false;
            String reason = "";

            // useCache=false on dependency → always re-execute
            if (!dep.isUseCache()) {
                needsRefresh = true;
                reason = "useCache=false";
            }
            // cacheable with positive TTL → check if expired
            else if (depStep.isCacheable() && depStep.getCacheTtlSeconds() > 0) {
                long elapsedSeconds = (System.currentTimeMillis() - depExecTime) / 1000;
                if (elapsedSeconds >= depStep.getCacheTtlSeconds()) {
                    needsRefresh = true;
                    reason = elapsedSeconds + "s elapsed > " + depStep.getCacheTtlSeconds() + "s TTL";
                }
            }

            if (!needsRefresh) continue;

            log.info("Dependency '{}' needs refresh ({}), re-executing", depStep.getName(), reason);

            // Recursively refresh this dep's own expired dependencies first
            refreshExpiredDependencies(depStep, stepMap, env, resultCache, executedAt, allExtractedVars, refreshedSteps,
                    runId, runRegistry, emitter, suiteStart, onStepComplete);

            // Check for manual input placeholders in the dep step (for re-execution prompt)
            Map<String, String> manualInputValues = Collections.emptyMap();
            if (runId != null && runRegistry != null && emitter != null) {
                if (dep.isReuseManualInput()) {
                    // Silently reuse cached values — no prompt
                    manualInputValues = runRegistry.getInputCache(runId);
                } else {
                    // Prompt user for new values
                    manualInputValues = promptManualInputForRefresh(depStep, env, allExtractedVars,
                            runId, runRegistry, emitter, suiteStart);
                }
            }

            // Re-execute the dependency — fromCache=false (fresh HTTP call)
            StepExecutionResult freshResult = executeStep(depStep, env, resultCache, allExtractedVars, stepMap, manualInputValues);
            freshResult.setFromCache(false);
            resultCache.put(depId, freshResult);
            executedAt.put(depId, System.currentTimeMillis());
            refreshedSteps.add(depId);

            // Update extracted variables with fresh values
            if (freshResult.getExtractedVariables() != null) {
                allExtractedVars.putAll(freshResult.getExtractedVariables());
            }
        }
    }

    /**
     * For a dep step being re-executed: check if it has #{...} patterns.
     * If all are cached, emit input-required with cachedValues so frontend can show reuse toggle.
     * Returns the manual input values to use (from cache or newly provided).
     */
    private Map<String, String> promptManualInputForRefresh(TestStep step,
                                                              Environment env,
                                                              Map<String, String> allExtractedVars,
                                                              UUID runId,
                                                              RunRegistry runRegistry,
                                                              SseEmitter emitter,
                                                              long suiteStart) {
        // Resolve env/step vars first, then scan for #{...}
        String resolvedUrl = resolvePlaceholders(step.getUrl(), env, allExtractedVars);
        String resolvedBody = resolvePlaceholders(step.getBody(), env, allExtractedVars);
        List<String> allTexts = new ArrayList<>();
        allTexts.add(resolvedUrl);
        allTexts.add(resolvedBody);
        for (KeyValuePair kv : parseKeyValuePairs(step.getQueryParams())) {
            allTexts.add(resolvePlaceholders(kv.getValue(), env, allExtractedVars));
        }
        for (KeyValuePair kv : parseKeyValuePairs(step.getHeaders())) {
            allTexts.add(resolvePlaceholders(kv.getValue(), env, allExtractedVars));
        }

        Map<String, String> inputCache = runRegistry.getInputCache(runId);

        // Extract ALL fields including cached ones (with cachedValue populated)
        List<ManualInputField> allFields = extractAllManualInputFields(inputCache, allTexts.toArray(new String[0]));
        if (allFields.isEmpty()) {
            return inputCache; // no #{...} patterns — use cache as-is
        }

        try {
            Map<String, Object> inputEvent = new LinkedHashMap<>();
            inputEvent.put("runId", runId.toString());
            inputEvent.put("stepId", step.getId().toString());
            inputEvent.put("stepName", step.getName());
            inputEvent.put("fields", allFields);
            emitter.send(SseEmitter.event()
                    .name("input-required")
                    .data(inputEvent, MediaType.APPLICATION_JSON));

            CompletableFuture<Map<String, String>> inputFuture = runRegistry.requestInput(runId);
            inputFuture.join();
        } catch (Exception e) {
            log.error("Manual input for dep refresh '{}' failed: {}", step.getName(), e.getMessage());
            // On failure, fall back to existing cache
        }

        return runRegistry.getInputCache(runId);
    }

    // ── Single step execution ───────────────────────────────────────────

    private StepExecutionResult executeStep(TestStep step,
                                             Environment env,
                                             Map<UUID, StepExecutionResult> resultCache,
                                             Map<String, String> allExtractedVars,
                                             Map<UUID, TestStep> stepMap,
                                             Map<String, String> manualInputValues) {
        long stepStart = System.currentTimeMillis();

        // 1. Check dependencies — if any required dep failed, skip this step
        if (step.getDependencies() != null) {
            for (StepDependency dep : step.getDependencies()) {
                StepExecutionResult depResult = resultCache.get(dep.getDependsOnStepId());
                if (depResult == null || "ERROR".equals(depResult.getStatus()) || "SKIPPED".equals(depResult.getStatus())) {
                    return StepExecutionResult.builder()
                            .stepId(step.getId())
                            .stepName(step.getName())
                            .status("SKIPPED")
                            .durationMs(System.currentTimeMillis() - stepStart)
                            .errorMessage("Skipped because dependency '"
                                    + (depResult != null ? depResult.getStepName() : dep.getDependsOnStepId())
                                    + "' did not succeed")
                            .extractedVariables(Collections.emptyMap())
                            .build();
                }

                // 2. Check if dependency result can be used from cache
                if (dep.isUseCache() && depResult.isFromCache()) {
                    // Accepted — the cached result is fine for this dependency
                    log.debug("Step '{}' using cached result for dependency '{}'",
                            step.getName(), depResult.getStepName());
                }
            }
        }

        // Collect warnings about unresolved variables
        List<String> stepWarnings = new ArrayList<>();

        // 3. Build URL
        String url = resolvePlaceholders(step.getUrl(), env, allExtractedVars, stepWarnings);
        url = resolveManualInputs(url, manualInputValues);
        if (url.startsWith("/") && env != null && env.getBaseUrl() != null && !env.getBaseUrl().isEmpty()) {
            // Strip trailing slash from baseUrl before prepending
            String baseUrl = env.getBaseUrl();
            if (baseUrl.endsWith("/")) {
                baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
            }
            url = baseUrl + url;
        }

        // 4. Add query params
        Map<String, String> resolvedQueryParams = new LinkedHashMap<>();
        List<KeyValuePair> queryParams = parseKeyValuePairs(step.getQueryParams());
        if (!queryParams.isEmpty()) {
            UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(url);
            for (KeyValuePair kv : queryParams) {
                String resolvedKey = resolvePlaceholders(kv.getKey(), env, allExtractedVars, stepWarnings);
                resolvedKey = resolveManualInputs(resolvedKey, manualInputValues);
                String resolvedValue = resolvePlaceholders(kv.getValue(), env, allExtractedVars, stepWarnings);
                resolvedValue = resolveManualInputs(resolvedValue, manualInputValues);
                builder.queryParam(resolvedKey, resolvedValue);
                resolvedQueryParams.put(resolvedKey, resolvedValue);
            }
            url = builder.build().encode().toUriString();
        }

        // 5. Build headers
        HttpHeaders httpHeaders = buildHeaders(step, env, allExtractedVars, manualInputValues);

        // 6. Build body based on body type
        Object body;
        String requestBodyDisplay;
        if (step.getBodyType() == BodyType.FORM_DATA) {
            // Build multipart form-data — do NOT set Content-Type manually;
            // Spring's FormHttpMessageConverter will set it with the boundary parameter
            httpHeaders.remove(HttpHeaders.CONTENT_TYPE);
            MultiValueMap<String, Object> formData = buildFormData(step, env, allExtractedVars, manualInputValues);
            body = formData;
            requestBodyDisplay = "[multipart/form-data: " + formData.size() + " fields]";
        } else {
            String textBody = resolvePlaceholders(step.getBody(), env, allExtractedVars, stepWarnings);
            textBody = resolveManualInputs(textBody, manualInputValues);
            body = textBody;
            requestBodyDisplay = textBody;
        }

        // 7. Convert our HttpMethod enum to Spring's HttpMethod
        org.springframework.http.HttpMethod springMethod = toSpringMethod(step.getMethod());

        // 8. Capture resolved request headers as flat map
        Map<String, String> requestHeadersMap = new LinkedHashMap<>();
        httpHeaders.forEach((key, values) -> {
            if (values != null && !values.isEmpty()) {
                requestHeadersMap.put(key, String.join(", ", values));
            }
        });

        // 9. Execute with retry logic
        StepExecutionResult result = executeWithRetry(step, env, url, httpHeaders, body, springMethod,
                resultCache, allExtractedVars, stepMap, stepStart);

        // 10. Set request details on the result
        result.setRequestUrl(url);
        result.setRequestBody(requestBodyDisplay);
        result.setRequestHeaders(requestHeadersMap);
        result.setRequestQueryParams(resolvedQueryParams);

        // 11. Set warnings about unresolved variables
        if (!stepWarnings.isEmpty()) {
            result.setWarnings(stepWarnings);
        }

        // 12. Extract variables from both response AND request context (all resolved values)
        Map<String, String> extracted = extractVariables(step,
                result.getResponseBody(), result.getResponseHeaders() != null ? result.getResponseHeaders() : Collections.emptyMap(), result.getResponseCode(),
                requestBodyDisplay, requestHeadersMap, resolvedQueryParams, url);
        result.setExtractedVariables(extracted);

        return result;
    }

    private StepExecutionResult executeWithRetry(TestStep step,
                                                   Environment env,
                                                   String url,
                                                   HttpHeaders httpHeaders,
                                                   Object body,
                                                   org.springframework.http.HttpMethod springMethod,
                                                   Map<UUID, StepExecutionResult> resultCache,
                                                   Map<String, String> allExtractedVars,
                                                   Map<UUID, TestStep> stepMap,
                                                   long stepStart) {
        int maxAttempts = 1; // default: one attempt, no retry
        int retryDelaySeconds = 0;
        StepResponseHandler retryHandler = null;

        // Pre-scan handlers for RETRY to know the max attempts
        if (step.getResponseHandlers() != null) {
            for (StepResponseHandler h : step.getResponseHandlers()) {
                if (h.getAction() == ResponseAction.RETRY && h.getRetryCount() > 0) {
                    if (retryHandler == null || h.getRetryCount() > retryHandler.getRetryCount()) {
                        retryHandler = h;
                    }
                }
            }
        }

        StepExecutionResult lastResult = null;

        for (int attempt = 0; attempt <= (retryHandler != null ? retryHandler.getRetryCount() : 0); attempt++) {
            if (attempt > 0) {
                // Wait before retry
                int delay = retryHandler != null ? retryHandler.getRetryDelaySeconds() : 1;
                try {
                    Thread.sleep(delay * 1000L);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
                log.info("Retrying step '{}', attempt {}", step.getName(), attempt + 1);
            }

            lastResult = executeHttpCall(step, env, url, httpHeaders, body, springMethod,
                    resultCache, allExtractedVars, stepMap, stepStart, attempt > 0);

            // If success or non-retryable, break
            if ("SUCCESS".equals(lastResult.getStatus()) || "SKIPPED".equals(lastResult.getStatus())) {
                break;
            }

            // Check if the response code matches a RETRY handler
            boolean shouldRetry = false;
            if (step.getResponseHandlers() != null) {
                List<StepResponseHandler> sorted = step.getResponseHandlers().stream()
                        .sorted(Comparator.comparingInt(StepResponseHandler::getPriority))
                        .toList();
                for (StepResponseHandler handler : sorted) {
                    if (matchesCode(handler.getMatchCode(), lastResult.getResponseCode())) {
                        if (handler.getAction() == ResponseAction.RETRY && attempt < handler.getRetryCount()) {
                            shouldRetry = true;
                            retryDelaySeconds = handler.getRetryDelaySeconds();
                        }
                        break; // First matching handler wins
                    }
                }
            }

            if (!shouldRetry) {
                break;
            }
        }

        return lastResult;
    }

    private StepExecutionResult executeHttpCall(TestStep step,
                                                 Environment env,
                                                 String url,
                                                 HttpHeaders httpHeaders,
                                                 Object body,
                                                 org.springframework.http.HttpMethod springMethod,
                                                 Map<UUID, StepExecutionResult> resultCache,
                                                 Map<String, String> allExtractedVars,
                                                 Map<UUID, TestStep> stepMap,
                                                 long stepStart,
                                                 boolean isRetry) {
        int responseCode = 0;
        String responseBody = "";
        Map<String, String> responseHeaders = new LinkedHashMap<>();

        try {
            HttpEntity<?> entity = new HttpEntity<>(body, httpHeaders);

            log.info("Executing step '{}': {} {}", step.getName(), springMethod, url);

            ResponseEntity<String> response = restTemplate.exchange(URI.create(url), springMethod, entity, String.class);

            responseCode = response.getStatusCode().value();
            responseBody = response.getBody() != null ? response.getBody() : "";
            if (response.getHeaders() != null) {
                response.getHeaders().forEach((key, values) -> {
                    if (values != null && !values.isEmpty()) {
                        responseHeaders.put(key, String.join(", ", values));
                    }
                });
            }
        } catch (HttpStatusCodeException e) {
            responseCode = e.getStatusCode().value();
            responseBody = e.getResponseBodyAsString();
            if (e.getResponseHeaders() != null) {
                e.getResponseHeaders().forEach((key, values) -> {
                    if (values != null && !values.isEmpty()) {
                        responseHeaders.put(key, String.join(", ", values));
                    }
                });
            }
        } catch (RestClientException e) {
            log.error("HTTP call failed for step '{}': {}", step.getName(), e.getMessage());
            Map<String, String> reqHeaders = new LinkedHashMap<>();
            httpHeaders.forEach((key, values) -> {
                if (values != null && !values.isEmpty()) {
                    reqHeaders.put(key, String.join(", ", values));
                }
            });
            return StepExecutionResult.builder()
                    .stepId(step.getId())
                    .stepName(step.getName())
                    .status("ERROR")
                    .responseCode(0)
                    .responseBody("")
                    .responseHeaders(Collections.emptyMap())
                    .durationMs(System.currentTimeMillis() - stepStart)
                    .errorMessage("HTTP call failed: " + e.getMessage())
                    .fromCache(false)
                    .extractedVariables(Collections.emptyMap())
                    .requestUrl(url)
                    .requestBody(body instanceof String ? (String) body : "[multipart/form-data]")
                    .requestHeaders(reqHeaders)
                    .build();
        }

        // 6. Match response code against handlers
        String status = "ERROR"; // default if no handler matches
        String errorMessage = null;

        if (step.getResponseHandlers() != null && !step.getResponseHandlers().isEmpty()) {
            List<StepResponseHandler> sorted = step.getResponseHandlers().stream()
                    .sorted(Comparator.comparingInt(StepResponseHandler::getPriority))
                    .toList();

            StepResponseHandler matched = null;
            for (StepResponseHandler handler : sorted) {
                if (matchesCode(handler.getMatchCode(), responseCode)) {
                    matched = handler;
                    break;
                }
            }

            if (matched != null) {
                switch (matched.getAction()) {
                    case SUCCESS:
                        status = isRetry ? "RETRIED" : "SUCCESS";
                        break;
                    case ERROR:
                        status = "ERROR";
                        errorMessage = "Handler matched code " + responseCode + " with ERROR action";
                        break;
                    case RETRY:
                        // Retry is handled by the outer loop; if we reach here on the last attempt it's an error
                        status = "ERROR";
                        errorMessage = "Exhausted retries for response code " + responseCode;
                        break;
                    case FIRE_SIDE_EFFECT:
                        status = isRetry ? "RETRIED" : "SUCCESS";
                        // Fire side effect step asynchronously
                        if (matched.getSideEffectStepId() != null) {
                            fireSideEffect(matched.getSideEffectStepId(), env, resultCache, allExtractedVars, stepMap);
                        }
                        break;
                }
            } else {
                // No handler matched → default ERROR
                status = "ERROR";
                errorMessage = "No response handler matched code " + responseCode;
            }
        } else {
            // No handlers defined — treat 2xx as success, others as error
            if (responseCode >= 200 && responseCode < 300) {
                status = isRetry ? "RETRIED" : "SUCCESS";
            } else {
                status = "ERROR";
                errorMessage = "HTTP " + responseCode + " with no response handlers defined";
            }
        }

        long durationMs = System.currentTimeMillis() - stepStart;

        return StepExecutionResult.builder()
                .stepId(step.getId())
                .stepName(step.getName())
                .status(status)
                .responseCode(responseCode)
                .responseBody(responseBody)
                .responseHeaders(responseHeaders)
                .durationMs(durationMs)
                .errorMessage(errorMessage)
                .fromCache(false)
                .extractedVariables(Collections.emptyMap())
                .build();
    }

    // ── Side effect execution (fire-and-forget) ─────────────────────────

    private void fireSideEffect(UUID sideEffectStepId,
                                 Environment env,
                                 Map<UUID, StepExecutionResult> resultCache,
                                 Map<String, String> allExtractedVars,
                                 Map<UUID, TestStep> stepMap) {
        TestStep sideEffectStep = stepMap.get(sideEffectStepId);
        if (sideEffectStep == null) {
            log.warn("Side effect step {} not found in suite, skipping", sideEffectStepId);
            return;
        }

        // Fire and forget — run in a separate thread
        Thread.ofVirtual().name("side-effect-" + sideEffectStepId).start(() -> {
            try {
                log.info("Firing side effect step '{}'", sideEffectStep.getName());
                executeStep(sideEffectStep, env, resultCache, allExtractedVars, stepMap, Collections.emptyMap());
            } catch (Exception e) {
                log.error("Side effect step '{}' failed: {}", sideEffectStep.getName(), e.getMessage());
            }
        });
    }

    // ── Header building ─────────────────────────────────────────────────

    private HttpHeaders buildHeaders(TestStep step, Environment env, Map<String, String> allExtractedVars, Map<String, String> manualInputValues) {
        HttpHeaders httpHeaders = new HttpHeaders();

        // Parse disabled default headers for this step
        Set<String> disabledHeaders = new HashSet<>();
        try {
            List<String> disabled = objectMapper.readValue(
                    step.getDisabledDefaultHeaders() != null ? step.getDisabledDefaultHeaders() : "[]",
                    new com.fasterxml.jackson.core.type.TypeReference<List<String>>() {});
            disabledHeaders.addAll(disabled);
        } catch (Exception ignored) {}

        // 1. Apply environment-level headers first (skip disabled ones)
        if (env != null && env.getHeaders() != null) {
            for (EnvironmentHeader eh : env.getHeaders()) {
                if (disabledHeaders.contains(eh.getHeaderKey())) continue;
                String value = resolveHeaderValue(eh, env, allExtractedVars);
                value = resolveManualInputs(value, manualInputValues);
                httpHeaders.add(eh.getHeaderKey(), value);
            }
        }

        // 2. Apply step-level headers (can override environment headers)
        List<KeyValuePair> stepHeaders = parseKeyValuePairs(step.getHeaders());
        for (KeyValuePair kv : stepHeaders) {
            String resolvedKey = resolvePlaceholders(kv.getKey(), env, allExtractedVars);
            resolvedKey = resolveManualInputs(resolvedKey, manualInputValues);
            String resolvedValue = resolvePlaceholders(kv.getValue(), env, allExtractedVars);
            resolvedValue = resolveManualInputs(resolvedValue, manualInputValues);
            httpHeaders.set(resolvedKey, resolvedValue);
        }

        return httpHeaders;
    }

    private String resolveHeaderValue(EnvironmentHeader eh, Environment env, Map<String, String> allExtractedVars) {
        return switch (eh.getValueType()) {
            case STATIC -> resolvePlaceholders(eh.getHeaderValue(), env, allExtractedVars);
            case VARIABLE -> {
                // Look up the variable name in env variables
                String varName = eh.getHeaderValue();
                if (env != null && env.getVariables() != null) {
                    for (EnvironmentVariable v : env.getVariables()) {
                        if (v.getKey().equals(varName)) {
                            yield v.getValue();
                        }
                    }
                }
                // Also check extracted vars
                String extracted = allExtractedVars.get(varName);
                yield extracted != null ? extracted : eh.getHeaderValue();
            }
            case UUID -> java.util.UUID.randomUUID().toString();
            case ISO_TIMESTAMP -> Instant.now().atOffset(ZoneOffset.UTC)
                    .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        };
    }

    // ── Variable extraction ─────────────────────────────────────────────

    private Map<String, String> extractVariables(TestStep step, String responseBody,
                                                  Map<String, String> responseHeaders,
                                                  int responseCode,
                                                  String requestBody,
                                                  Map<String, String> requestHeaders,
                                                  Map<String, String> queryParams,
                                                  String requestUrl) {
        Map<String, String> extracted = new LinkedHashMap<>();

        if (step.getExtractVariables() == null || step.getExtractVariables().isEmpty()) {
            return extracted;
        }

        for (StepExtractVariable var : step.getExtractVariables()) {
            String qualifiedName = step.getName() + "." + var.getVariableName();
            try {
                String value = switch (var.getSource()) {
                    case RESPONSE_BODY -> extractJsonPath(responseBody, var.getJsonPath());
                    case RESPONSE_HEADER -> {
                        String headerVal = responseHeaders.get(var.getJsonPath());
                        yield headerVal != null ? headerVal : "";
                    }
                    case STATUS_CODE -> String.valueOf(responseCode);
                    case REQUEST_BODY -> extractJsonPath(requestBody != null ? requestBody : "", var.getJsonPath());
                    case REQUEST_HEADER -> {
                        String headerVal = requestHeaders != null ? requestHeaders.get(var.getJsonPath()) : null;
                        yield headerVal != null ? headerVal : "";
                    }
                    case QUERY_PARAM -> {
                        String paramVal = queryParams != null ? queryParams.get(var.getJsonPath()) : null;
                        yield paramVal != null ? paramVal : "";
                    }
                    case REQUEST_URL -> requestUrl != null ? requestUrl : "";
                };
                extracted.put(qualifiedName, value);
            } catch (Exception e) {
                log.warn("Failed to extract variable '{}' from step '{}': {}",
                        var.getVariableName(), step.getName(), e.getMessage());
                extracted.put(qualifiedName, "");
            }
        }

        return extracted;
    }

    // ── Placeholder resolution ──────────────────────────────────────────

    String resolvePlaceholders(String text, Environment env, Map<String, String> extractedVars) {
        if (text == null || text.isEmpty()) return text;

        String result = text;

        // Replace ${VARNAME} with environment variable values (or generated values for UUID/ISO_TIMESTAMP)
        if (env != null && env.getVariables() != null) {
            Matcher envMatcher = ENV_VAR_PATTERN.matcher(result);
            StringBuilder sb = new StringBuilder();
            while (envMatcher.find()) {
                String varName = envMatcher.group(1);
                String replacement = "";
                for (EnvironmentVariable v : env.getVariables()) {
                    if (v.getKey().equals(varName)) {
                        replacement = switch (v.getValueType()) {
                            case UUID -> java.util.UUID.randomUUID().toString();
                            case ISO_TIMESTAMP -> java.time.Instant.now()
                                    .atOffset(java.time.ZoneOffset.UTC)
                                    .format(java.time.format.DateTimeFormatter.ISO_OFFSET_DATE_TIME);
                            default -> v.getValue();
                        };
                        break;
                    }
                }
                envMatcher.appendReplacement(sb, Matcher.quoteReplacement(replacement));
            }
            envMatcher.appendTail(sb);
            result = sb.toString();
        }

        // Replace {{stepName.variableName}} with extracted variables
        Matcher stepMatcher = STEP_VAR_PATTERN.matcher(result);
        if (stepMatcher.find()) {
            StringBuilder sb = new StringBuilder();
            stepMatcher.reset();
            while (stepMatcher.find()) {
                String varRef = stepMatcher.group(1);
                if (extractedVars != null && extractedVars.containsKey(varRef)) {
                    stepMatcher.appendReplacement(sb, Matcher.quoteReplacement(extractedVars.get(varRef)));
                } else {
                    // Variable not found — log warning to help diagnose missing dependencies/extractions
                    String[] parts = varRef.split("\\.", 2);
                    if (parts.length == 2) {
                        log.warn("Unresolved variable '{{{{{}}}}}': step '{}' either is not a dependency, "
                                + "was not executed, or does not extract variable '{}'. "
                                + "Available variables: {}",
                                varRef, parts[0], parts[1],
                                extractedVars != null ? extractedVars.keySet() : "[]");
                    } else {
                        log.warn("Unresolved variable '{{{{{}}}}}': not found in extracted variables. "
                                + "Available variables: {}",
                                varRef, extractedVars != null ? extractedVars.keySet() : "[]");
                    }
                    stepMatcher.appendReplacement(sb, Matcher.quoteReplacement("{{" + varRef + "}}"));
                }
            }
            stepMatcher.appendTail(sb);
            result = sb.toString();
        }

        return result;
    }

    /**
     * Overloaded version that collects unresolved variable warnings into the provided list.
     */
    String resolvePlaceholders(String text, Environment env, Map<String, String> extractedVars, List<String> warnings) {
        if (text == null || text.isEmpty()) return text;

        // First do env var + step var resolution via the main method
        String result = resolvePlaceholders(text, env, extractedVars);

        // Now detect any remaining unresolved {{...}} placeholders and add warnings
        if (warnings != null) {
            Matcher remaining = STEP_VAR_PATTERN.matcher(result);
            while (remaining.find()) {
                String varRef = remaining.group(1);
                String[] parts = varRef.split("\\.", 2);
                if (parts.length == 2) {
                    warnings.add("Unresolved variable '{{" + varRef + "}}': step '" + parts[0]
                            + "' is not a dependency, was not executed, or does not extract variable '" + parts[1]
                            + "'. Available: " + (extractedVars != null ? extractedVars.keySet() : "[]"));
                } else {
                    warnings.add("Unresolved variable '{{" + varRef + "}}': not found in extracted variables. Available: "
                            + (extractedVars != null ? extractedVars.keySet() : "[]"));
                }
            }
        }

        return result;
    }

    // ── Manual input resolution ────────────────────────────────────────

    String resolveManualInputs(String text, Map<String, String> inputValues) {
        if (text == null || text.isEmpty() || inputValues == null) return text;

        Matcher matcher = MANUAL_INPUT_PATTERN.matcher(text);
        StringBuilder sb = new StringBuilder();
        while (matcher.find()) {
            String content = matcher.group(1); // "name" or "name:default"
            String name;
            String defaultValue = null;
            int colonIdx = content.indexOf(':');
            if (colonIdx > 0) {
                name = content.substring(0, colonIdx);
                defaultValue = content.substring(colonIdx + 1);
            } else {
                name = content;
            }
            String replacement = inputValues.getOrDefault(name, defaultValue != null ? defaultValue : "");
            matcher.appendReplacement(sb, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    List<ManualInputField> extractManualInputFields(Map<String, String> inputCache, String... texts) {
        Map<String, ManualInputField> fields = new LinkedHashMap<>();
        for (String text : texts) {
            if (text == null || text.isEmpty()) continue;
            Matcher matcher = MANUAL_INPUT_PATTERN.matcher(text);
            while (matcher.find()) {
                String content = matcher.group(1);
                String name;
                String defaultValue = null;
                int colonIdx = content.indexOf(':');
                if (colonIdx > 0) {
                    name = content.substring(0, colonIdx);
                    defaultValue = content.substring(colonIdx + 1);
                } else {
                    name = content;
                }
                // Skip if already cached
                if (inputCache != null && inputCache.containsKey(name)) continue;
                fields.putIfAbsent(name, ManualInputField.builder().name(name).defaultValue(defaultValue).build());
            }
        }
        return new ArrayList<>(fields.values());
    }

    /**
     * Like extractManualInputFields but returns ALL #{...} fields including cached ones.
     * Cached fields have their cachedValue populated so the frontend can show a reuse toggle.
     * Used when re-executing a dependency step that already has cached manual input values.
     */
    List<ManualInputField> extractAllManualInputFields(Map<String, String> inputCache, String... texts) {
        Map<String, ManualInputField> fields = new LinkedHashMap<>();
        for (String text : texts) {
            if (text == null || text.isEmpty()) continue;
            Matcher matcher = MANUAL_INPUT_PATTERN.matcher(text);
            while (matcher.find()) {
                String content = matcher.group(1);
                String name;
                String defaultValue = null;
                int colonIdx = content.indexOf(':');
                if (colonIdx > 0) {
                    name = content.substring(0, colonIdx);
                    defaultValue = content.substring(colonIdx + 1);
                } else {
                    name = content;
                }
                String cachedValue = inputCache != null ? inputCache.get(name) : null;
                fields.putIfAbsent(name, ManualInputField.builder()
                        .name(name)
                        .defaultValue(defaultValue)
                        .cachedValue(cachedValue)
                        .build());
            }
        }
        return new ArrayList<>(fields.values());
    }

    // ── JSON path extraction ────────────────────────────────────────────

    String extractJsonPath(String responseBody, String jsonPath) {
        if (responseBody == null || responseBody.isEmpty()) return "";
        if (jsonPath == null || jsonPath.isEmpty()) return "";

        try {
            JsonNode root = objectMapper.readTree(responseBody);

            // Parse path: "$.data.accessToken" → ["data", "accessToken"]
            String path = jsonPath;
            if (path.startsWith("$.")) {
                path = path.substring(2);
            } else if (path.startsWith("$")) {
                path = path.substring(1);
            }

            String[] segments = path.split("\\.");
            JsonNode current = root;

            for (String segment : segments) {
                if (segment.isEmpty()) continue;

                // Support functions: length(), size()
                if (segment.equals("length()") || segment.equals("size()")) {
                    if (current.isArray()) {
                        return String.valueOf(current.size());
                    } else if (current.isObject()) {
                        return String.valueOf(current.size());
                    } else if (current.isTextual()) {
                        return String.valueOf(current.asText().length());
                    }
                    return "0";
                }

                // Check for array index notation, e.g. "items[0]"
                if (segment.contains("[") && segment.endsWith("]")) {
                    int bracketStart = segment.indexOf('[');
                    String fieldName = segment.substring(0, bracketStart);
                    String indexStr = segment.substring(bracketStart + 1, segment.length() - 1);

                    if (!fieldName.isEmpty()) {
                        current = current.get(fieldName);
                        if (current == null) return "";
                    }

                    try {
                        int index = Integer.parseInt(indexStr);
                        if (current.isArray() && index >= 0 && index < current.size()) {
                            current = current.get(index);
                        } else {
                            return "";
                        }
                    } catch (NumberFormatException e) {
                        return "";
                    }
                } else {
                    current = current.get(segment);
                }

                if (current == null || current.isMissingNode()) {
                    return "";
                }
            }

            // Return text value for string nodes, otherwise raw text
            if (current.isTextual()) {
                return current.asText();
            } else if (current.isNumber()) {
                return current.asText();
            } else if (current.isBoolean()) {
                return current.asText();
            } else if (current.isNull()) {
                return "";
            } else {
                return current.toString();
            }
        } catch (JsonProcessingException e) {
            log.warn("Failed to parse JSON for path extraction '{}': {}", jsonPath, e.getMessage());
            return "";
        }
    }

    // ── Response code matching ──────────────────────────────────────────

    boolean matchesCode(String pattern, int actualCode) {
        if (pattern == null || pattern.isEmpty()) return false;

        String actual = String.valueOf(actualCode);

        // Pad actual to 3 digits for comparison
        while (actual.length() < 3) {
            actual = "0" + actual;
        }

        // Exact match: "200", "404", etc.
        if (!pattern.contains("x") && !pattern.contains("X")) {
            try {
                return Integer.parseInt(pattern) == actualCode;
            } catch (NumberFormatException e) {
                return false;
            }
        }

        // Wildcard match: "2xx" matches 200-299, "20x" matches 200-209
        String lowerPattern = pattern.toLowerCase();
        if (lowerPattern.length() != 3) return false;

        for (int i = 0; i < 3; i++) {
            char p = lowerPattern.charAt(i);
            char a = actual.charAt(i);
            if (p != 'x' && p != a) {
                return false;
            }
        }
        return true;
    }

    // ── Utility methods ─────────────────────────────────────────────────

    private org.springframework.http.HttpMethod toSpringMethod(HttpMethod method) {
        return switch (method) {
            case GET -> org.springframework.http.HttpMethod.GET;
            case POST -> org.springframework.http.HttpMethod.POST;
            case PUT -> org.springframework.http.HttpMethod.PUT;
            case DELETE -> org.springframework.http.HttpMethod.DELETE;
            case PATCH -> org.springframework.http.HttpMethod.PATCH;
        };
    }

    private List<KeyValuePair> parseKeyValuePairs(String json) {
        if (json == null || json.isEmpty() || "[]".equals(json)) {
            return Collections.emptyList();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<KeyValuePair>>() {});
        } catch (JsonProcessingException e) {
            log.warn("Failed to parse key-value pairs JSON: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    private static final Pattern FILE_REF_PATTERN = Pattern.compile("^\\$\\{FILE:(.+)}$");

    private MultiValueMap<String, Object> buildFormData(TestStep step,
                                                         Environment env,
                                                         Map<String, String> allExtractedVars,
                                                         Map<String, String> manualInputValues) {
        MultiValueMap<String, Object> formData = new LinkedMultiValueMap<>();
        String fieldsJson = step.getFormDataFields();
        if (fieldsJson == null || fieldsJson.isBlank() || "[]".equals(fieldsJson)) {
            return formData;
        }

        List<FormDataFieldDto> fields;
        try {
            fields = objectMapper.readValue(fieldsJson, new TypeReference<List<FormDataFieldDto>>() {});
        } catch (JsonProcessingException e) {
            log.warn("Failed to parse form data fields: {}", e.getMessage());
            return formData;
        }

        UUID envId = env != null ? env.getId() : null;
        log.info("Building form-data: {} fields, envId={}", fields.size(), envId);

        for (FormDataFieldDto field : fields) {
            String key = field.getKey();
            if (key == null || key.isBlank()) continue;

            String value = field.getValue() != null ? field.getValue() : "";

            // Check for ${FILE:variableKey} reference FIRST regardless of field type,
            // because ENV_VAR_PATTERN also matches ${FILE:...} and would wipe it
            java.util.regex.Matcher fileMatch = FILE_REF_PATTERN.matcher(value.trim());
            if (fileMatch.matches() && envId != null) {
                String fileKey = fileMatch.group(1);
                EnvironmentFile envFile = fileRepo.findByEnvironmentIdAndFileKey(envId, fileKey)
                        .orElse(null);
                if (envFile != null) {
                    log.info("Resolved file reference: field='{}', fileName='{}', size={} bytes",
                            key, envFile.getFileName(), envFile.getFileData().length);
                    String contentType = envFile.getContentType() != null
                            ? envFile.getContentType() : "application/octet-stream";
                    ByteArrayResource resource = new ByteArrayResource(envFile.getFileData()) {
                        @Override
                        public String getFilename() {
                            return envFile.getFileName();
                        }
                    };
                    // Wrap in HttpEntity with per-part headers for proper multipart file handling
                    HttpHeaders partHeaders = new HttpHeaders();
                    partHeaders.setContentType(MediaType.parseMediaType(contentType));
                    formData.add(key, new HttpEntity<>(resource, partHeaders));
                } else {
                    log.warn("File reference ${{FILE:{}}} not found in environment {}", fileKey, envId);
                }
            } else {
                // Text field — resolve placeholders
                value = resolvePlaceholders(value, env, allExtractedVars);
                value = resolveManualInputs(value, manualInputValues);
                formData.add(key, value);
            }
        }

        return formData;
    }
}
