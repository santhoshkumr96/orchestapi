package com.orchestrator.dto;

import lombok.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StepExecutionResult {
    private UUID stepId;
    private String stepName;
    private String status; // SUCCESS, ERROR, SKIPPED, RETRIED
    private int responseCode;
    private String responseBody;
    private Map<String, String> responseHeaders;
    private long durationMs;
    private String errorMessage;
    private boolean fromCache;
    private Map<String, String> extractedVariables; // variables extracted from this step
    @Builder.Default
    private List<VerificationResultDto> verificationResults = new ArrayList<>();

    // Request details (resolved placeholders)
    private String requestUrl;
    private String requestBody;
    private Map<String, String> requestHeaders;
    private Map<String, String> requestQueryParams;
}
