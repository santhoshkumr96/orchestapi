package com.orchestrator.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestrator.connector.ConnectorFactory;
import com.orchestrator.connector.InfraConnector;
import com.orchestrator.dto.AssertionResultDto;
import com.orchestrator.dto.VerificationResultDto;
import com.orchestrator.model.Environment;
import com.orchestrator.model.EnvironmentConnector;
import com.orchestrator.model.StepVerification;
import com.orchestrator.model.VerificationAssertion;
import com.orchestrator.model.enums.AssertionOperator;
import com.orchestrator.model.enums.ConnectorType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
@Slf4j
public class VerificationService {

    private final ConnectorFactory connectorFactory;
    private final ObjectMapper objectMapper;

    /**
     * Start pre-listeners for Kafka/RabbitMQ verifications that have preListen=true.
     * Returns a map of verification -> CompletableFuture with the raw result string.
     * These run on virtual threads and wait up to their timeout.
     */
    public Map<StepVerification, CompletableFuture<String>> startPreListeners(
            Set<StepVerification> verifications,
            Environment env,
            Map<String, String> allExtractedVars,
            ExecutionService executionService) {

        Map<StepVerification, CompletableFuture<String>> preListeners = new LinkedHashMap<>();
        if (verifications == null) return preListeners;

        for (StepVerification v : verifications) {
            if (!v.isPreListen()) continue;

            EnvironmentConnector connector = findConnector(env, v.getConnectorName());
            if (connector == null) continue;

            String resolvedQuery = executionService.resolvePlaceholders(v.getQuery(), env, allExtractedVars);

            // For Kafka pre-listeners: if key still has unresolved {{...}} placeholders
            // (references current step's response which isn't available yet), strip the key filter.
            // The message content assertions ($.value.event, etc.) will verify correctness.
            if (connector.getType() == ConnectorType.KAFKA && resolvedQuery.contains("{{")) {
                resolvedQuery = resolvedQuery.replaceAll("(?m)\\nkey=.*", "").trim();
            }

            final String finalQuery = resolvedQuery;
            Map<String, Object> config = parseConfig(connector.getConfig());

            ExecutorService virtualExecutor = Executors.newVirtualThreadPerTaskExecutor();
            CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> {
                try {
                    InfraConnector infraConnector = connectorFactory.getConnector(connector.getType());
                    return infraConnector.execute(connector.getType(), config, finalQuery, v.getTimeoutSeconds());
                } catch (Exception e) {
                    log.error("Pre-listen failed for connector '{}': {}", v.getConnectorName(), e.getMessage());
                    return null; // will be handled as error in runVerifications
                }
            }, virtualExecutor);

            preListeners.put(v, future);
        }

        return preListeners;
    }

    /**
     * Run all verifications for a step. Pre-listened verifications use their CompletableFuture result.
     * Post-listen verifications execute fresh.
     */
    public List<VerificationResultDto> runVerifications(
            Set<StepVerification> verifications,
            Environment env,
            Map<String, String> allExtractedVars,
            Map<StepVerification, CompletableFuture<String>> preListeners,
            ExecutionService executionService) {

        List<VerificationResultDto> results = new ArrayList<>();
        if (verifications == null || verifications.isEmpty()) return results;

        for (StepVerification v : verifications) {
            results.add(runSingleVerification(v, env, allExtractedVars, preListeners, executionService));
        }
        return results;
    }

    private VerificationResultDto runSingleVerification(
            StepVerification verification,
            Environment env,
            Map<String, String> allExtractedVars,
            Map<StepVerification, CompletableFuture<String>> preListeners,
            ExecutionService executionService) {

        long start = System.currentTimeMillis();

        // 1. Find connector from environment
        EnvironmentConnector connector = findConnector(env, verification.getConnectorName());
        if (connector == null) {
            return errorResult(verification, start, "Connector '" + verification.getConnectorName() + "' not found in environment");
        }

        // 2. Get raw result: either from pre-listener or execute now
        String rawResult;
        try {
            CompletableFuture<String> preListener = preListeners != null ? preListeners.get(verification) : null;
            if (preListener != null) {
                // Pre-listened -- wait for the future
                rawResult = preListener.join();
                if (rawResult == null) {
                    return errorResult(verification, start, "Pre-listener returned null (connection/timeout error)");
                }
            } else {
                // Post-listen: timeoutSeconds acts as a delay before executing the query
                if (verification.getTimeoutSeconds() > 0) {
                    try { Thread.sleep(verification.getTimeoutSeconds() * 1000L); }
                    catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                }
                Map<String, Object> config = parseConfig(connector.getConfig());
                String resolvedQuery = executionService.resolvePlaceholders(verification.getQuery(), env, allExtractedVars);
                InfraConnector infraConnector = connectorFactory.getConnector(connector.getType());
                rawResult = infraConnector.execute(connector.getType(), config, resolvedQuery, verification.getQueryTimeoutSeconds());
            }
        } catch (Exception e) {
            return errorResult(verification, start, "Connector error: " + e.getMessage());
        }

        // 3. Run assertions against the result JSON
        List<AssertionResultDto> assertionResults = runAssertions(verification.getAssertions(), rawResult, env, allExtractedVars, executionService);
        boolean allPassed = assertionResults.stream().allMatch(AssertionResultDto::isPassed);

        return VerificationResultDto.builder()
                .connectorName(verification.getConnectorName())
                .connectorType(connector.getType().name())
                .query(verification.getQuery())
                .status(allPassed ? "PASS" : "FAIL")
                .durationMs(System.currentTimeMillis() - start)
                .rawResult(rawResult)
                .assertions(assertionResults)
                .build();
    }

    private List<AssertionResultDto> runAssertions(
            Set<VerificationAssertion> assertions,
            String rawResultJson,
            Environment env,
            Map<String, String> allExtractedVars,
            ExecutionService executionService) {

        List<AssertionResultDto> results = new ArrayList<>();
        if (assertions == null || assertions.isEmpty()) return results;

        for (VerificationAssertion a : assertions) {
            // Extract actual value using extractJsonPath
            String actual = executionService.extractJsonPath(rawResultJson, a.getJsonPath());

            // Resolve placeholders in expected value
            String expected = executionService.resolvePlaceholders(a.getExpectedValue(), env, allExtractedVars);

            // Compare
            boolean passed = compare(actual, expected, a.getOperator());

            results.add(AssertionResultDto.builder()
                    .jsonPath(a.getJsonPath())
                    .operator(a.getOperator().name())
                    .expected(expected)
                    .actual(actual)
                    .passed(passed)
                    .build());
        }
        return results;
    }

    private boolean compare(String actual, String expected, AssertionOperator operator) {
        return switch (operator) {
            case EQUALS -> Objects.equals(actual, expected);
            case NOT_EQUALS -> !Objects.equals(actual, expected);
            case CONTAINS -> actual != null && actual.contains(expected);
            case NOT_CONTAINS -> actual == null || !actual.contains(expected);
            case REGEX -> actual != null && Pattern.matches(expected, actual);
            case GT -> compareNumeric(actual, expected) > 0;
            case LT -> compareNumeric(actual, expected) < 0;
            case GTE -> compareNumeric(actual, expected) >= 0;
            case LTE -> compareNumeric(actual, expected) <= 0;
            case EXISTS -> actual != null && !actual.isEmpty();
            case NOT_EXISTS -> actual == null || actual.isEmpty();
        };
    }

    private int compareNumeric(String actual, String expected) {
        try {
            double a = Double.parseDouble(actual);
            double e = Double.parseDouble(expected);
            return Double.compare(a, e);
        } catch (NumberFormatException ex) {
            // Fallback to string comparison
            return actual != null ? actual.compareTo(expected) : -1;
        }
    }

    private EnvironmentConnector findConnector(Environment env, String connectorName) {
        if (env == null || env.getConnectors() == null) return null;
        return env.getConnectors().stream()
                .filter(c -> c.getName().equals(connectorName))
                .findFirst()
                .orElse(null);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseConfig(String configJson) {
        try {
            return objectMapper.readValue(configJson, Map.class);
        } catch (Exception e) {
            return Collections.emptyMap();
        }
    }

    private VerificationResultDto errorResult(StepVerification verification, long start, String message) {
        return VerificationResultDto.builder()
                .connectorName(verification.getConnectorName())
                .connectorType("")
                .query(verification.getQuery())
                .status("ERROR")
                .durationMs(System.currentTimeMillis() - start)
                .errorMessage(message)
                .assertions(Collections.emptyList())
                .build();
    }
}
