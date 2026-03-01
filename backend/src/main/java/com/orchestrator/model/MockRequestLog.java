package com.orchestrator.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "orchestapi_mock_request_logs", schema = "orchestrator")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MockRequestLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "mock_server_id", nullable = false)
    private UUID mockServerId;

    @Column(name = "matched_endpoint_id")
    private UUID matchedEndpointId;

    @Column(name = "http_method", nullable = false, length = 10)
    private String httpMethod;

    @Column(name = "request_path", nullable = false, length = 1000)
    private String requestPath;

    @Column(name = "request_headers", columnDefinition = "jsonb")
    @JdbcTypeCode(SqlTypes.JSON)
    private String requestHeaders;

    @Column(name = "request_body", columnDefinition = "TEXT")
    private String requestBody;

    @Column(name = "query_params", columnDefinition = "jsonb")
    @JdbcTypeCode(SqlTypes.JSON)
    private String queryParams;

    @Column(name = "response_status")
    private Integer responseStatus;

    @Column(name = "response_body", columnDefinition = "TEXT")
    private String responseBody;

    @Column(nullable = false)
    @Builder.Default
    private boolean matched = false;

    @Column(name = "duration_ms")
    private Integer durationMs;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
