package com.orchestrator.dto;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.*;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WebhookRequest {

    @NotBlank(message = "Name is required")
    @Size(max = 200)
    private String name;

    @Size(max = 2000)
    private String description;

    @Builder.Default
    private int defaultResponseStatus = 200;

    private String defaultResponseBody;

    @Valid
    @JsonSetter(nulls = Nulls.AS_EMPTY)
    @Builder.Default
    private List<KeyValuePair> defaultResponseHeaders = new ArrayList<>();
}
