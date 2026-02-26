package com.orchestrator.dto;

import lombok.*;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VerificationResultDto {

    private String connectorName;
    private String connectorType;
    private String query;
    private String status;  // PASS, FAIL, ERROR
    private long durationMs;
    private String errorMessage;
    private String rawResult;

    @Builder.Default
    private List<AssertionResultDto> assertions = new ArrayList<>();
}
