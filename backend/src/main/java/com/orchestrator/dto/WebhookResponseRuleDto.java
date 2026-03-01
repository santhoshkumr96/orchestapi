package com.orchestrator.dto;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.*;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WebhookResponseRuleDto {

    private UUID id;

    @NotBlank(message = "Rule name is required")
    private String name;

    @Builder.Default
    private boolean enabled = true;

    @Builder.Default
    private int responseStatus = 200;

    private String responseBody;

    @Builder.Default
    @JsonSetter(nulls = Nulls.AS_EMPTY)
    private List<KeyValuePair> responseHeaders = new ArrayList<>();

    @Valid
    @Builder.Default
    @JsonSetter(nulls = Nulls.AS_EMPTY)
    private List<WebhookRuleConditionDto> conditions = new ArrayList<>();
}
