package com.orchestrator.dto;

import lombok.*;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class RunRequest {
    private UUID environmentId; // optional override
}
