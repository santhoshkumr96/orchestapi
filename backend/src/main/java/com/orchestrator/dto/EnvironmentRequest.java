package com.orchestrator.dto;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.*;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EnvironmentRequest {

    @NotBlank(message = "Name is required")
    @Size(max = 100, message = "Name must not exceed 100 characters")
    private String name;

    @NotBlank(message = "Base URL is required")
    @Size(max = 500, message = "Base URL must not exceed 500 characters")
    @Pattern(regexp = "^https?://.*", message = "Base URL must start with http:// or https://")
    private String baseUrl;

    @Valid
    @JsonSetter(nulls = Nulls.AS_EMPTY)
    @Builder.Default
    private List<VariableDto> variables = new ArrayList<>();

    @Valid
    @JsonSetter(nulls = Nulls.AS_EMPTY)
    @Builder.Default
    private List<HeaderDto> headers = new ArrayList<>();

    @Valid
    @JsonSetter(nulls = Nulls.AS_EMPTY)
    @Builder.Default
    private List<ConnectorDto> connectors = new ArrayList<>();
}
