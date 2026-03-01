package com.orchestrator.dto;

import com.orchestrator.model.MockMatchRule;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.*;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MockMatchRuleDto {

    private UUID id;

    @NotNull(message = "Rule type is required")
    @NotBlank(message = "Rule type is required")
    @Size(max = 20)
    private String ruleType;

    @NotBlank(message = "Match key is required")
    @Size(max = 200)
    private String matchKey;

    @Size(max = 500)
    private String matchValue;

    public static MockMatchRuleDto from(MockMatchRule rule) {
        return MockMatchRuleDto.builder()
                .id(rule.getId())
                .ruleType(rule.getRuleType().name())
                .matchKey(rule.getMatchKey())
                .matchValue(rule.getMatchValue())
                .build();
    }
}
