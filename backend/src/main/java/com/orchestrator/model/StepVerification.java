package com.orchestrator.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "step_verifications", schema = "orchestrator")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StepVerification {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "step_id", nullable = false)
    @JsonIgnore
    private TestStep step;

    @Column(name = "connector_name", nullable = false, length = 100)
    private String connectorName;

    @Column(columnDefinition = "TEXT", nullable = false)
    @Builder.Default
    private String query = "";

    @Column(name = "timeout_seconds", nullable = false)
    @Builder.Default
    private int timeoutSeconds = 30;

    @Column(name = "query_timeout_seconds", nullable = false)
    @Builder.Default
    private int queryTimeoutSeconds = 30;

    @Column(name = "pre_listen", nullable = false)
    @Builder.Default
    private boolean preListen = false;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private int sortOrder = 0;

    @OneToMany(mappedBy = "verification", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder")
    @Builder.Default
    private Set<VerificationAssertion> assertions = new LinkedHashSet<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

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
