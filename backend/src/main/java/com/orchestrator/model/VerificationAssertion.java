package com.orchestrator.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.orchestrator.model.enums.AssertionOperator;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "orchestapi_verification_assertions", schema = "orchestrator")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VerificationAssertion {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "verification_id", nullable = false)
    @JsonIgnore
    private StepVerification verification;

    @Column(name = "json_path", nullable = false, length = 500)
    private String jsonPath;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AssertionOperator operator;

    @Column(name = "expected_value", columnDefinition = "TEXT", nullable = false)
    @Builder.Default
    private String expectedValue = "";

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private int sortOrder = 0;
}
