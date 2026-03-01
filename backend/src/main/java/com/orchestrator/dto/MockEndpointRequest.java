package com.orchestrator.dto;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
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
@Builder
public class MockEndpointRequest {

    @NotBlank(message = "Name is required")
    @Size(max = 200)
    private String name;

    @Size(max = 2000)
    private String description;

    @NotBlank(message = "HTTP method is required")
    @Size(max = 10)
    private String httpMethod;

    @NotBlank(message = "Path pattern is required")
    @Size(max = 500)
    private String pathPattern;

    @Builder.Default
    private int responseStatus = 200;

    private String responseBody;

    @JsonSetter(nulls = Nulls.AS_EMPTY)
    @Builder.Default
    private List<KeyValuePair> responseHeaders = new ArrayList<>();

    @Builder.Default
    private int delayMs = 0;

    @Builder.Default
    private boolean enabled = true;

    @JsonSetter(nulls = Nulls.AS_EMPTY)
    @Valid
    @Builder.Default
    private List<MockMatchRuleDto> matchRules = new ArrayList<>();
}
