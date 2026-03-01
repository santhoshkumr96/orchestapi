package com.orchestrator.dto;

import com.orchestrator.model.enums.MockMatchRuleType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WebhookRuleConditionDto {

    private UUID id;

    @NotNull(message = "Condition type is required")
    private MockMatchRuleType conditionType;

    @NotBlank(message = "Match key is required")
    private String matchKey;

    private String matchValue;
}
