package com.orchestrator.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MockServerRequest {

    @NotBlank(message = "Name is required")
    @Size(max = 200)
    private String name;

    @Size(max = 2000)
    private String description;
}
