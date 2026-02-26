package com.orchestrator.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.hibernate.annotations.SQLRestriction;

import com.orchestrator.model.enums.BodyType;

import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "orchestapi_test_steps", schema = "orchestrator")
@SQLRestriction("deleted_at IS NULL")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TestStep {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "suite_id", nullable = false)
    @JsonIgnore
    private TestSuite suite;

    @Column(nullable = false, length = 200)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    @Builder.Default
    private HttpMethod method = HttpMethod.GET;

    @Column(columnDefinition = "TEXT", nullable = false)
    @Builder.Default
    private String url = "";

    @Column(columnDefinition = "jsonb", nullable = false)
    @JdbcTypeCode(SqlTypes.JSON)
    @Builder.Default
    private String headers = "[]";

    @Enumerated(EnumType.STRING)
    @Column(name = "body_type", nullable = false, length = 20)
    @Builder.Default
    private BodyType bodyType = BodyType.NONE;

    @Column(columnDefinition = "TEXT", nullable = false)
    @Builder.Default
    private String body = "";

    @Column(name = "form_data_fields", columnDefinition = "jsonb", nullable = false)
    @JdbcTypeCode(SqlTypes.JSON)
    @Builder.Default
    private String formDataFields = "[]";

    @Column(name = "query_params", columnDefinition = "jsonb", nullable = false)
    @JdbcTypeCode(SqlTypes.JSON)
    @Builder.Default
    private String queryParams = "[]";

    @Column(nullable = false)
    @Builder.Default
    private boolean cacheable = false;

    @Column(name = "dependency_only", nullable = false)
    @Builder.Default
    private boolean dependencyOnly = false;

    @Column(name = "cache_ttl_seconds", nullable = false)
    @Builder.Default
    private int cacheTtlSeconds = 0;

    @Column(name = "disabled_default_headers", columnDefinition = "jsonb", nullable = false)
    @JdbcTypeCode(SqlTypes.JSON)
    @Builder.Default
    private String disabledDefaultHeaders = "[]";

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private int sortOrder = 0;

    @OneToMany(mappedBy = "step", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private Set<StepDependency> dependencies = new LinkedHashSet<>();

    @OneToMany(mappedBy = "step", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("priority")
    @Builder.Default
    private Set<StepResponseHandler> responseHandlers = new LinkedHashSet<>();

    @OneToMany(mappedBy = "step", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private Set<StepExtractVariable> extractVariables = new LinkedHashSet<>();

    @OneToMany(mappedBy = "step", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder")
    @Builder.Default
    private Set<StepVerification> verifications = new LinkedHashSet<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
