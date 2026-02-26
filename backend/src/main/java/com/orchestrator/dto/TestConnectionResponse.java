package com.orchestrator.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TestConnectionResponse {
    private boolean success;
    private String message;
    private long durationMs;
}
