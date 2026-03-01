package com.orchestrator.dto;

import com.orchestrator.model.MockRequestLog;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MockRequestLogResponse {

    private UUID id;
    private UUID mockServerId;
    private UUID matchedEndpointId;
    private String httpMethod;
    private String requestPath;
    private String requestHeaders;
    private String requestBody;
    private String queryParams;
    private Integer responseStatus;
    private String responseBody;
    private boolean matched;
    private Integer durationMs;
    private LocalDateTime createdAt;

    public static MockRequestLogResponse from(MockRequestLog log) {
        return MockRequestLogResponse.builder()
                .id(log.getId())
                .mockServerId(log.getMockServerId())
                .matchedEndpointId(log.getMatchedEndpointId())
                .httpMethod(log.getHttpMethod())
                .requestPath(log.getRequestPath())
                .requestHeaders(log.getRequestHeaders())
                .requestBody(log.getRequestBody())
                .queryParams(log.getQueryParams())
                .responseStatus(log.getResponseStatus())
                .responseBody(log.getResponseBody())
                .matched(log.isMatched())
                .durationMs(log.getDurationMs())
                .createdAt(log.getCreatedAt())
                .build();
    }
}
