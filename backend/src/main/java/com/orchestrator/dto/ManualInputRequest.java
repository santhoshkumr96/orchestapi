package com.orchestrator.dto;

import lombok.*;

import java.util.Map;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ManualInputRequest {
    private Map<String, String> values;
}
