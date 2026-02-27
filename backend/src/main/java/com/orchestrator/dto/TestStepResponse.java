package com.orchestrator.dto;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestrator.model.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TestStepResponse {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private UUID id;
    private UUID suiteId;
    private String name;
    private HttpMethod method;
    private String url;
    private List<KeyValuePair> headers;
    private List<KeyValuePair> queryParams;
    private String bodyType;
    private String body;
    private List<FormDataFieldDto> formDataFields;
    private boolean cacheable;
    private int cacheTtlSeconds;
    private boolean dependencyOnly;
    private List<String> disabledDefaultHeaders;
    private int sortOrder;
    private String groupName;
    private List<StepDependencyDto> dependencies;
    private List<StepResponseHandlerDto> responseHandlers;
    private List<StepExtractVariableDto> extractVariables;
    private List<VerificationDto> verifications;
    private List<ResponseValidationDto> responseValidations;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static TestStepResponse from(TestStep step) {
        return TestStepResponse.builder()
                .id(step.getId())
                .suiteId(step.getSuite() != null ? step.getSuite().getId() : null)
                .name(step.getName())
                .method(step.getMethod())
                .url(step.getUrl())
                .headers(parseJson(step.getHeaders()))
                .queryParams(parseJson(step.getQueryParams()))
                .bodyType(step.getBodyType().name())
                .body(step.getBody())
                .formDataFields(parseFormDataFields(step.getFormDataFields()))
                .cacheable(step.isCacheable())
                .cacheTtlSeconds(step.getCacheTtlSeconds())
                .dependencyOnly(step.isDependencyOnly())
                .disabledDefaultHeaders(parseStringList(step.getDisabledDefaultHeaders()))
                .sortOrder(step.getSortOrder())
                .groupName(step.getGroupName())
                .dependencies(mapDependencies(step))
                .responseHandlers(mapHandlers(step))
                .extractVariables(mapExtractVars(step))
                .verifications(mapVerifications(step))
                .responseValidations(mapResponseValidations(step))
                .createdAt(step.getCreatedAt())
                .updatedAt(step.getUpdatedAt())
                .build();
    }

    private static List<KeyValuePair> parseJson(String json) {
        if (json == null || json.isBlank() || "[]".equals(json)) {
            return Collections.emptyList();
        }
        try {
            return MAPPER.readValue(json, new TypeReference<List<KeyValuePair>>() {});
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    private static List<StepDependencyDto> mapDependencies(TestStep step) {
        if (step.getDependencies() == null) return Collections.emptyList();
        return step.getDependencies().stream()
                .map(d -> StepDependencyDto.builder()
                        .id(d.getId())
                        .dependsOnStepId(d.getDependsOnStepId())
                        .useCache(d.isUseCache())
                        .reuseManualInput(d.isReuseManualInput())
                        .build())
                .toList();
    }

    private static List<StepResponseHandlerDto> mapHandlers(TestStep step) {
        if (step.getResponseHandlers() == null) return Collections.emptyList();
        return step.getResponseHandlers().stream()
                .map(h -> StepResponseHandlerDto.builder()
                        .id(h.getId())
                        .matchCode(h.getMatchCode())
                        .action(h.getAction())
                        .sideEffectStepId(h.getSideEffectStepId())
                        .retryCount(h.getRetryCount())
                        .retryDelaySeconds(h.getRetryDelaySeconds())
                        .priority(h.getPriority())
                        .build())
                .toList();
    }

    private static List<StepExtractVariableDto> mapExtractVars(TestStep step) {
        if (step.getExtractVariables() == null) return Collections.emptyList();
        return step.getExtractVariables().stream()
                .map(v -> StepExtractVariableDto.builder()
                        .id(v.getId())
                        .variableName(v.getVariableName())
                        .jsonPath(v.getJsonPath())
                        .source(v.getSource())
                        .build())
                .toList();
    }

    private static List<VerificationDto> mapVerifications(TestStep step) {
        if (step.getVerifications() == null) return Collections.emptyList();
        return step.getVerifications().stream()
                .map(v -> VerificationDto.builder()
                        .id(v.getId())
                        .connectorName(v.getConnectorName())
                        .query(v.getQuery())
                        .timeoutSeconds(v.getTimeoutSeconds())
                        .queryTimeoutSeconds(v.getQueryTimeoutSeconds())
                        .preListen(v.isPreListen())
                        .assertions(v.getAssertions() == null ? Collections.emptyList() :
                                v.getAssertions().stream()
                                        .map(a -> AssertionDto.builder()
                                                .id(a.getId())
                                                .jsonPath(a.getJsonPath())
                                                .operator(a.getOperator())
                                                .expectedValue(a.getExpectedValue())
                                                .build())
                                        .toList())
                        .build())
                .toList();
    }

    private static List<ResponseValidationDto> mapResponseValidations(TestStep step) {
        if (step.getResponseValidations() == null) return Collections.emptyList();
        return step.getResponseValidations().stream()
                .map(rv -> ResponseValidationDto.builder()
                        .id(rv.getId())
                        .validationType(rv.getValidationType())
                        .headerName(rv.getHeaderName())
                        .jsonPath(rv.getJsonPath())
                        .operator(rv.getOperator())
                        .expectedValue(rv.getExpectedValue())
                        .expectedBody(rv.getExpectedBody())
                        .matchMode(rv.getMatchMode())
                        .expectedType(rv.getExpectedType())
                        .build())
                .toList();
    }

    private static List<FormDataFieldDto> parseFormDataFields(String json) {
        if (json == null || json.isBlank() || "[]".equals(json)) {
            return new ArrayList<>();
        }
        try {
            return MAPPER.readValue(json, new TypeReference<List<FormDataFieldDto>>() {});
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    private static List<String> parseStringList(String json) {
        if (json == null || json.isBlank() || "[]".equals(json)) {
            return Collections.emptyList();
        }
        try {
            return MAPPER.readValue(json, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }
}
