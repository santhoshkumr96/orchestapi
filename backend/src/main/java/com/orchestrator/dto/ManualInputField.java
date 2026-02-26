package com.orchestrator.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ManualInputField {
    private String name;
    private String defaultValue;
    private String cachedValue; // non-null when re-executing a dep that already has a cached value
}
