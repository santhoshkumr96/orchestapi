package com.orchestrator.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "step_response_handlers", schema = "orchestrator")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StepResponseHandler {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "step_id", nullable = false)
    @JsonIgnore
    private TestStep step;

    @Column(name = "match_code", nullable = false, length = 10)
    private String matchCode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private ResponseAction action = ResponseAction.ERROR;

    @Column(name = "side_effect_step_id")
    private UUID sideEffectStepId;

    @Column(name = "retry_count", nullable = false)
    @Builder.Default
    private int retryCount = 0;

    @Column(name = "retry_delay_seconds", nullable = false)
    @Builder.Default
    private int retryDelaySeconds = 0;

    @Column(nullable = false)
    @Builder.Default
    private int priority = 0;
}
