package com.orchestrator.dto;

import com.orchestrator.model.WebhookRequestLog;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WebhookRequestLogResponse {

    private UUID id;
    private UUID webhookId;
    private String httpMethod;
    private String requestPath;
    private String requestHeaders;
    private String requestBody;
    private String queryParams;
    private String contentType;
    private Long contentLength;
    private String sourceIp;
    private boolean multipart;
    private String files;
    private Integer responseStatus;
    private String responseBody;
    private String matchedRuleName;
    private LocalDateTime createdAt;

    public static WebhookRequestLogResponse from(WebhookRequestLog log) {
        return WebhookRequestLogResponse.builder()
                .id(log.getId())
                .webhookId(log.getWebhookId())
                .httpMethod(log.getHttpMethod())
                .requestPath(log.getRequestPath())
                .requestHeaders(log.getRequestHeaders())
                .requestBody(log.getRequestBody())
                .queryParams(log.getQueryParams())
                .contentType(log.getContentType())
                .contentLength(log.getContentLength())
                .sourceIp(log.getSourceIp())
                .multipart(log.isMultipart())
                .files(log.getFiles())
                .responseStatus(log.getResponseStatus())
                .responseBody(log.getResponseBody())
                .matchedRuleName(log.getMatchedRuleName())
                .createdAt(log.getCreatedAt())
                .build();
    }
}
