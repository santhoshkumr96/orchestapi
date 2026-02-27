package com.orchestrator.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ResponseValidationResultDto {

    private String validationType;
    private boolean passed;
    private String message;
    private String headerName;
    private String jsonPath;
    private String operator;
    private String expected;
    private String actual;
    private String matchMode;
    private String expectedType;
    private String actualType;
}
