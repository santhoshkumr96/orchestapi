package com.orchestrator.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "orchestapi_step_dependencies", schema = "orchestrator")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StepDependency {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "step_id", nullable = false)
    @JsonIgnore
    private TestStep step;

    @Column(name = "depends_on_step_id", nullable = false)
    private UUID dependsOnStepId;

    @Column(name = "use_cache", nullable = false)
    @Builder.Default
    private boolean useCache = true;

    @Column(name = "reuse_manual_input", nullable = false)
    @Builder.Default
    private boolean reuseManualInput = true;
}
