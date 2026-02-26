package com.orchestrator.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FormDataFieldDto {

    private String key;
    private String type; // "text" or "file"
    private String value;
}
