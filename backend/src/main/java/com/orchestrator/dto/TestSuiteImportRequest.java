package com.orchestrator.dto;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import com.orchestrator.model.HttpMethod;
import com.orchestrator.model.enums.ExpectedDataType;
import com.orchestrator.model.enums.AssertionOperator;
import com.orchestrator.model.enums.ResponseValidationType;
import com.orchestrator.model.ExtractionSource;
import com.orchestrator.model.ResponseAction;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.*;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class TestSuiteImportRequest {

    @NotBlank(message = "Name is required")
    @Size(max = 200, message = "Name must not exceed 200 characters")
    private String name;

    @Size(max = 2000, message = "Description must not exceed 2000 characters")
    private String description;

    @Valid
    @JsonSetter(nulls = Nulls.AS_EMPTY)
    private List<ImportStepDto> steps = new ArrayList<>();

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ImportStepDto {
        @NotBlank(message = "Step name is required")
        private String name;
        private HttpMethod method;
        private String url;
        private String groupName;
        private int sortOrder;

        @JsonSetter(nulls = Nulls.AS_EMPTY)
        private List<KeyValuePair> headers = new ArrayList<>();

        @JsonSetter(nulls = Nulls.AS_EMPTY)
        private List<KeyValuePair> queryParams = new ArrayList<>();

        private String bodyType;
        private String body;

        @JsonSetter(nulls = Nulls.AS_EMPTY)
        private List<FormDataFieldDto> formDataFields = new ArrayList<>();

        private boolean cacheable;
        private int cacheTtlSeconds;
        private boolean dependencyOnly;

        @JsonSetter(nulls = Nulls.AS_EMPTY)
        private List<String> disabledDefaultHeaders = new ArrayList<>();

        @JsonSetter(nulls = Nulls.AS_EMPTY)
        private List<ImportDependencyDto> dependencies = new ArrayList<>();

        @JsonSetter(nulls = Nulls.AS_EMPTY)
        private List<ImportHandlerDto> responseHandlers = new ArrayList<>();

        @Valid
        @JsonSetter(nulls = Nulls.AS_EMPTY)
        private List<StepExtractVariableDto> extractVariables = new ArrayList<>();

        @Valid
        @JsonSetter(nulls = Nulls.AS_EMPTY)
        private List<VerificationDto> verifications = new ArrayList<>();

        @Valid
        @JsonSetter(nulls = Nulls.AS_EMPTY)
        private List<ResponseValidationDto> responseValidations = new ArrayList<>();
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ImportDependencyDto {
        private String dependsOnStepName;
        private boolean useCache;
        private boolean reuseManualInput;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ImportHandlerDto {
        private String matchCode;
        private ResponseAction action;
        private String sideEffectStepName;
        private int retryCount;
        private int retryDelaySeconds;
        private int priority;
    }
}
