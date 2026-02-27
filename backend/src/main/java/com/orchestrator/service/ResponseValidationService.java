package com.orchestrator.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.orchestrator.dto.ResponseValidationResultDto;
import com.orchestrator.model.Environment;
import com.orchestrator.model.StepResponseValidation;
import com.orchestrator.model.enums.AssertionOperator;
import com.orchestrator.model.enums.ExpectedDataType;
import com.orchestrator.model.enums.ResponseValidationType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
@Slf4j
public class ResponseValidationService {

    private final ObjectMapper objectMapper;

    public List<ResponseValidationResultDto> runValidations(
            Set<StepResponseValidation> validations,
            String responseBody,
            Map<String, String> responseHeaders,
            Environment env,
            Map<String, String> extractedVars,
            ExecutionService executionService) {

        List<ResponseValidationResultDto> results = new ArrayList<>();
        if (validations == null || validations.isEmpty()) return results;

        for (StepResponseValidation v : validations) {
            results.add(runSingleValidation(v, responseBody, responseHeaders, env, extractedVars, executionService));
        }
        return results;
    }

    private ResponseValidationResultDto runSingleValidation(
            StepResponseValidation validation,
            String responseBody,
            Map<String, String> responseHeaders,
            Environment env,
            Map<String, String> extractedVars,
            ExecutionService executionService) {

        return switch (validation.getValidationType()) {
            case HEADER -> validateHeader(validation, responseHeaders, env, extractedVars, executionService);
            case BODY_EXACT_MATCH -> validateBodyExactMatch(validation, responseBody, env, extractedVars, executionService);
            case BODY_FIELD -> validateBodyField(validation, responseBody, env, extractedVars, executionService);
            case BODY_DATA_TYPE -> validateBodyDataType(validation, responseBody, executionService);
        };
    }

    private ResponseValidationResultDto validateHeader(
            StepResponseValidation validation,
            Map<String, String> responseHeaders,
            Environment env,
            Map<String, String> extractedVars,
            ExecutionService executionService) {

        String headerName = validation.getHeaderName();
        String expected = executionService.resolvePlaceholders(
                validation.getExpectedValue() != null ? validation.getExpectedValue() : "", env, extractedVars);

        // Case-insensitive header lookup
        String actual = null;
        if (responseHeaders != null) {
            for (Map.Entry<String, String> entry : responseHeaders.entrySet()) {
                if (entry.getKey().equalsIgnoreCase(headerName)) {
                    actual = entry.getValue();
                    break;
                }
            }
        }

        boolean passed = compare(actual, expected, validation.getOperator());

        return ResponseValidationResultDto.builder()
                .validationType(ResponseValidationType.HEADER.name())
                .headerName(headerName)
                .operator(validation.getOperator() != null ? validation.getOperator().name() : "")
                .expected(expected)
                .actual(actual != null ? actual : "")
                .passed(passed)
                .message(passed ? "Header '" + headerName + "' passed" : "Header '" + headerName + "' failed")
                .build();
    }

    private ResponseValidationResultDto validateBodyExactMatch(
            StepResponseValidation validation,
            String responseBody,
            Environment env,
            Map<String, String> extractedVars,
            ExecutionService executionService) {

        String expectedBody = executionService.resolvePlaceholders(
                validation.getExpectedBody() != null ? validation.getExpectedBody() : "", env, extractedVars);
        String matchMode = validation.getMatchMode() != null ? validation.getMatchMode() : "STRICT";

        try {
            JsonNode expectedNode = objectMapper.readTree(expectedBody);
            JsonNode actualNode = objectMapper.readTree(responseBody != null ? responseBody : "");

            boolean passed = switch (matchMode) {
                case "FLEXIBLE" -> flexibleEquals(expectedNode, actualNode);
                case "STRUCTURE" -> structureEquals(expectedNode, actualNode);
                default -> expectedNode.equals(actualNode); // STRICT
            };

            String modeLabel = matchMode.toLowerCase();
            return ResponseValidationResultDto.builder()
                    .validationType(ResponseValidationType.BODY_EXACT_MATCH.name())
                    .matchMode(matchMode)
                    .expected(truncate(expectedBody, 500))
                    .actual(truncate(responseBody != null ? responseBody : "", 500))
                    .passed(passed)
                    .message(passed ? "Body " + modeLabel + " match passed" : "Body " + modeLabel + " match failed")
                    .build();
        } catch (Exception e) {
            return ResponseValidationResultDto.builder()
                    .validationType(ResponseValidationType.BODY_EXACT_MATCH.name())
                    .matchMode(matchMode)
                    .expected(truncate(expectedBody, 500))
                    .actual(truncate(responseBody != null ? responseBody : "", 500))
                    .passed(false)
                    .message("JSON parse error: " + e.getMessage())
                    .build();
        }
    }

    private ResponseValidationResultDto validateBodyField(
            StepResponseValidation validation,
            String responseBody,
            Environment env,
            Map<String, String> extractedVars,
            ExecutionService executionService) {

        String jsonPath = validation.getJsonPath();
        String expected = executionService.resolvePlaceholders(
                validation.getExpectedValue() != null ? validation.getExpectedValue() : "", env, extractedVars);

        String actual = executionService.extractJsonPath(responseBody != null ? responseBody : "", jsonPath);
        boolean passed = compare(actual, expected, validation.getOperator());

        return ResponseValidationResultDto.builder()
                .validationType(ResponseValidationType.BODY_FIELD.name())
                .jsonPath(jsonPath)
                .operator(validation.getOperator() != null ? validation.getOperator().name() : "")
                .expected(expected)
                .actual(actual != null ? actual : "")
                .passed(passed)
                .message(passed ? jsonPath + " passed" : jsonPath + " failed")
                .build();
    }

    private ResponseValidationResultDto validateBodyDataType(
            StepResponseValidation validation,
            String responseBody,
            ExecutionService executionService) {

        String jsonPath = validation.getJsonPath();
        ExpectedDataType expectedType = validation.getExpectedType();

        try {
            JsonNode rootNode = objectMapper.readTree(responseBody != null ? responseBody : "");
            JsonNode targetNode = navigateJsonPath(rootNode, jsonPath);

            String actualType = getNodeType(targetNode);
            boolean passed = matchesType(targetNode, expectedType);

            return ResponseValidationResultDto.builder()
                    .validationType(ResponseValidationType.BODY_DATA_TYPE.name())
                    .jsonPath(jsonPath)
                    .expectedType(expectedType != null ? expectedType.name() : "")
                    .actualType(actualType)
                    .passed(passed)
                    .message(passed ? jsonPath + " is " + expectedType : jsonPath + " expected " + expectedType + " but got " + actualType)
                    .build();
        } catch (Exception e) {
            return ResponseValidationResultDto.builder()
                    .validationType(ResponseValidationType.BODY_DATA_TYPE.name())
                    .jsonPath(jsonPath)
                    .expectedType(expectedType != null ? expectedType.name() : "")
                    .actualType("ERROR")
                    .passed(false)
                    .message("JSON parse error: " + e.getMessage())
                    .build();
        }
    }

    /**
     * Flexible JSON comparison: expected must be a subset of actual.
     * Extra keys in actual are ignored. Array elements matched regardless of order.
     */
    private boolean flexibleEquals(JsonNode expected, JsonNode actual) {
        if (expected == null || expected.isNull()) {
            return actual == null || actual.isNull();
        }
        if (actual == null || actual.isNull()) {
            return false;
        }

        if (expected.isObject() && actual.isObject()) {
            Iterator<String> fieldNames = expected.fieldNames();
            while (fieldNames.hasNext()) {
                String field = fieldNames.next();
                if (!actual.has(field)) return false;
                if (!flexibleEquals(expected.get(field), actual.get(field))) return false;
            }
            return true;
        }

        if (expected.isArray() && actual.isArray()) {
            if (expected.size() != actual.size()) return false;
            // Try to match each expected element to an actual element (order-independent)
            boolean[] used = new boolean[actual.size()];
            for (int i = 0; i < expected.size(); i++) {
                boolean found = false;
                for (int j = 0; j < actual.size(); j++) {
                    if (!used[j] && flexibleEquals(expected.get(i), actual.get(j))) {
                        used[j] = true;
                        found = true;
                        break;
                    }
                }
                if (!found) return false;
            }
            return true;
        }

        return expected.equals(actual);
    }

    /**
     * Structure-only comparison: checks that actual has the same keys/structure as expected,
     * but values can differ. Only validates key presence and node types (object vs array vs primitive).
     */
    private boolean structureEquals(JsonNode expected, JsonNode actual) {
        if (expected == null || expected.isNull()) {
            return actual == null || actual.isNull();
        }
        if (actual == null || actual.isNull()) {
            return false;
        }

        if (expected.isObject() && actual.isObject()) {
            Iterator<String> fieldNames = expected.fieldNames();
            while (fieldNames.hasNext()) {
                String field = fieldNames.next();
                if (!actual.has(field)) return false;
                // Recursively check structure for nested objects/arrays
                JsonNode expectedChild = expected.get(field);
                JsonNode actualChild = actual.get(field);
                if (expectedChild.isObject() || expectedChild.isArray()) {
                    if (!structureEquals(expectedChild, actualChild)) return false;
                }
                // For primitive values, don't compare — just check the key exists (already done above)
            }
            return true;
        }

        if (expected.isArray() && actual.isArray()) {
            // For arrays, check that actual has at least the same number of elements
            // and each expected element's structure matches
            if (actual.size() < expected.size()) return false;
            for (int i = 0; i < expected.size(); i++) {
                if (!structureEquals(expected.get(i), actual.get(i))) return false;
            }
            return true;
        }

        // Primitives: structure match only cares that both are primitives (key exists)
        return true;
    }

    /**
     * Navigate a JsonNode using a simplified JSONPath (same logic as ExecutionService.extractJsonPath).
     */
    private JsonNode navigateJsonPath(JsonNode root, String path) {
        if (path == null || path.isEmpty()) return root;
        if (!path.startsWith("$")) return root;

        String remaining = path.substring(1); // skip $
        JsonNode current = root;

        while (!remaining.isEmpty() && current != null) {
            if (remaining.startsWith(".")) {
                remaining = remaining.substring(1);
            }

            // Handle array index: [0]
            if (remaining.startsWith("[")) {
                int closeBracket = remaining.indexOf(']');
                if (closeBracket < 0) break;
                String indexStr = remaining.substring(1, closeBracket);
                remaining = remaining.substring(closeBracket + 1);
                try {
                    int index = Integer.parseInt(indexStr);
                    if (current.isArray() && index < current.size()) {
                        current = current.get(index);
                    } else {
                        return null;
                    }
                } catch (NumberFormatException e) {
                    return null;
                }
            } else {
                // Handle field name
                int nextDot = remaining.indexOf('.');
                int nextBracket = remaining.indexOf('[');
                int end = remaining.length();
                if (nextDot >= 0) end = Math.min(end, nextDot);
                if (nextBracket >= 0) end = Math.min(end, nextBracket);

                String fieldName = remaining.substring(0, end);
                remaining = remaining.substring(end);

                if (fieldName.isEmpty()) continue;

                // Handle functions
                if (fieldName.equals("length()") || fieldName.equals("size()")) {
                    if (current.isArray()) return objectMapper.valueToTree(current.size());
                    if (current.isObject()) return objectMapper.valueToTree(current.size());
                    if (current.isTextual()) return objectMapper.valueToTree(current.asText().length());
                    return objectMapper.valueToTree(0);
                }

                if (current.isObject()) {
                    current = current.get(fieldName);
                } else {
                    return null;
                }
            }
        }

        return current;
    }

    private String getNodeType(JsonNode node) {
        if (node == null || node.isMissingNode()) return "MISSING";
        if (node.isNull()) return "NULL";
        if (node.isBoolean()) return "BOOLEAN";
        if (node.isNumber()) return "NUMBER";
        if (node.isTextual()) return "STRING";
        if (node.isArray()) return "ARRAY";
        if (node.isObject()) return "OBJECT";
        return "UNKNOWN";
    }

    private boolean matchesType(JsonNode node, ExpectedDataType expectedType) {
        if (expectedType == null) return false;
        if (node == null || node.isMissingNode()) return false;

        return switch (expectedType) {
            case STRING -> node.isTextual();
            case NUMBER -> node.isNumber();
            case BOOLEAN -> node.isBoolean();
            case ARRAY -> node.isArray();
            case OBJECT -> node.isObject();
            case NULL -> node.isNull();
        };
    }

    private boolean compare(String actual, String expected, AssertionOperator operator) {
        if (operator == null) return Objects.equals(actual, expected);
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
            return actual != null ? actual.compareTo(expected) : -1;
        }
    }

    private String truncate(String value, int maxLen) {
        if (value == null) return "";
        return value.length() > maxLen ? value.substring(0, maxLen) + "..." : value;
    }
}
