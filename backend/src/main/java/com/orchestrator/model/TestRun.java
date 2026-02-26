package com.orchestrator.model;

import com.orchestrator.model.enums.RunStatus;
import com.orchestrator.model.enums.TriggerType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "test_runs", schema = "orchestrator")
@SQLRestriction("deleted_at IS NULL")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TestRun {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "suite_id", nullable = false)
    private UUID suiteId;

    @Column(name = "environment_id", nullable = false)
    private UUID environmentId;

    @Enumerated(EnumType.STRING)
    @Column(name = "trigger_type", nullable = false, length = 20)
    @Builder.Default
    private TriggerType triggerType = TriggerType.MANUAL;

    @Column(name = "schedule_id")
    private UUID scheduleId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    @Builder.Default
    private RunStatus status = RunStatus.RUNNING;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "total_duration_ms")
    @Builder.Default
    private Long totalDurationMs = 0L;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "result_data", columnDefinition = "jsonb")
    private String resultData;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        if (startedAt == null) startedAt = LocalDateTime.now();
    }
}
