package com.orchestrator.dto;

import lombok.*;

import java.time.LocalDateTime;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CronPreviewResponse {
    private boolean valid;
    private String error;
    private List<LocalDateTime> nextFireTimes;
}
