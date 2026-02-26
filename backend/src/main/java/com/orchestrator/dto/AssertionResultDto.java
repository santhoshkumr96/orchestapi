package com.orchestrator.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AssertionResultDto {

    private String jsonPath;
    private String operator;
    private String expected;
    private String actual;
    private boolean passed;
}
