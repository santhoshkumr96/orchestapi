package com.orchestrator.dto;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.*;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VerificationDto {

    private UUID id;

    @NotBlank(message = "Connector name is required")
    private String connectorName;

    @Builder.Default
    private String query = "";

    @Builder.Default
    private int timeoutSeconds = 30;

    @Builder.Default
    private int queryTimeoutSeconds = 30;

    @Builder.Default
    private boolean preListen = false;

    @Valid
    @JsonSetter(nulls = Nulls.AS_EMPTY)
    @Builder.Default
    private List<AssertionDto> assertions = new ArrayList<>();
}
