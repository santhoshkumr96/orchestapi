package com.orchestrator.dto;

import com.orchestrator.model.enums.AssertionOperator;
import com.orchestrator.model.enums.ExpectedDataType;
import com.orchestrator.model.enums.ResponseValidationType;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ResponseValidationDto {

    private UUID id;

    @NotNull(message = "Validation type is required")
    private ResponseValidationType validationType;

    private String headerName;
    private String jsonPath;
    private AssertionOperator operator;
    private String expectedValue;
    private String expectedBody;

    @Builder.Default
    private String matchMode = "STRICT";

    private ExpectedDataType expectedType;
}
