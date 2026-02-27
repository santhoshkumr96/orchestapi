package com.orchestrator.dto;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import com.orchestrator.model.HttpMethod;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.*;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TestStepRequest {

    @NotBlank(message = "Name is required")
    @Size(max = 200, message = "Name must not exceed 200 characters")
    private String name;

    @NotNull(message = "HTTP method is required")
    @Builder.Default
    private HttpMethod method = HttpMethod.GET;

    @NotBlank(message = "URL is required")
    private String url;

    @Valid
    @JsonSetter(nulls = Nulls.AS_EMPTY)
    @Builder.Default
    private List<KeyValuePair> headers = new ArrayList<>();

    @Valid
    @JsonSetter(nulls = Nulls.AS_EMPTY)
    @Builder.Default
    private List<KeyValuePair> queryParams = new ArrayList<>();

    @Valid
    @JsonSetter(nulls = Nulls.AS_EMPTY)
    @Builder.Default
    private List<StepDependencyDto> dependencies = new ArrayList<>();

    @Valid
    @JsonSetter(nulls = Nulls.AS_EMPTY)
    @Builder.Default
    private List<StepResponseHandlerDto> responseHandlers = new ArrayList<>();

    @Valid
    @JsonSetter(nulls = Nulls.AS_EMPTY)
    @Builder.Default
    private List<StepExtractVariableDto> extractVariables = new ArrayList<>();

    @Valid
    @JsonSetter(nulls = Nulls.AS_EMPTY)
    @Builder.Default
    private List<VerificationDto> verifications = new ArrayList<>();

    @Valid
    @JsonSetter(nulls = Nulls.AS_EMPTY)
    @Builder.Default
    private List<ResponseValidationDto> responseValidations = new ArrayList<>();

    @Builder.Default
    private String bodyType = "NONE";

    @Builder.Default
    private String body = "";

    @Valid
    @JsonSetter(nulls = Nulls.AS_EMPTY)
    @Builder.Default
    private List<FormDataFieldDto> formDataFields = new ArrayList<>();

    @Builder.Default
    private boolean cacheable = false;

    @Builder.Default
    private int cacheTtlSeconds = 0;

    @Builder.Default
    private boolean dependencyOnly = false;

    @JsonSetter(nulls = Nulls.AS_EMPTY)
    @Builder.Default
    private List<String> disabledDefaultHeaders = new ArrayList<>();

    @Size(max = 100, message = "Group name must not exceed 100 characters")
    private String groupName;
}
