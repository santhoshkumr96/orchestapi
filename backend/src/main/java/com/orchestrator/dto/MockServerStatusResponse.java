package com.orchestrator.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MockServerStatusResponse {

    private boolean enabled;
    private String mockUrl;
    private long endpointCount;
    private long enabledEndpointCount;
}
