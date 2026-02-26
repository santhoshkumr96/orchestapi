package com.orchestrator.dto;

import com.orchestrator.model.HeaderValueType;
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
public class HeaderDto {
    private UUID id;

    @NotBlank(message = "Header key is required")
    @Size(max = 255, message = "Header key must not exceed 255 characters")
    private String headerKey;

    @NotNull(message = "Value type is required")
    @Builder.Default
    private HeaderValueType valueType = HeaderValueType.STATIC;

    @Builder.Default
    private String headerValue = "";
}
