package com.orchestrator.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class KeyValuePair {

    @NotBlank(message = "Key is required")
    private String key;

    @Builder.Default
    private String value = "";
}
