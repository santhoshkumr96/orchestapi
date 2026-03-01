package com.orchestrator.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "orchestapi_webhook_request_logs", schema = "orchestrator")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WebhookRequestLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "webhook_id", nullable = false)
    private UUID webhookId;

    @Column(name = "http_method", nullable = false, length = 10)
    private String httpMethod;

    @Column(name = "request_path", nullable = false, length = 2000)
    private String requestPath;

    @Column(name = "request_headers", columnDefinition = "jsonb")
    @JdbcTypeCode(SqlTypes.JSON)
    private String requestHeaders;

    @Column(name = "request_body", columnDefinition = "TEXT")
    private String requestBody;

    @Column(name = "query_params", columnDefinition = "jsonb")
    @JdbcTypeCode(SqlTypes.JSON)
    private String queryParams;

    @Column(name = "content_type", length = 200)
    private String contentType;

    @Column(name = "content_length")
    private Long contentLength;

    @Column(name = "source_ip", length = 45)
    private String sourceIp;

    @Column(name = "is_multipart")
    @Builder.Default
    private boolean multipart = false;

    @Column(columnDefinition = "jsonb")
    @JdbcTypeCode(SqlTypes.JSON)
    private String files;

    @Column(name = "response_status")
    private Integer responseStatus;

    @Column(name = "response_body", columnDefinition = "TEXT")
    private String responseBody;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
