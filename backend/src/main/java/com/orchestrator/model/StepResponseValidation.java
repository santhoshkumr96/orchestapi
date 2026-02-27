package com.orchestrator.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.orchestrator.model.enums.AssertionOperator;
import com.orchestrator.model.enums.ExpectedDataType;
import com.orchestrator.model.enums.ResponseValidationType;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "orchestapi_step_response_validations", schema = "orchestrator")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StepResponseValidation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "step_id", nullable = false)
    @JsonIgnore
    private TestStep step;

    @Enumerated(EnumType.STRING)
    @Column(name = "validation_type", nullable = false, length = 30)
    private ResponseValidationType validationType;

    @Column(name = "header_name", length = 500)
    private String headerName;

    @Column(name = "json_path", length = 500)
    private String jsonPath;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private AssertionOperator operator;

    @Column(name = "expected_value", columnDefinition = "TEXT")
    private String expectedValue;

    @Column(name = "expected_body", columnDefinition = "TEXT")
    private String expectedBody;

    @Column(name = "match_mode", length = 20)
    @Builder.Default
    private String matchMode = "STRICT";

    @Enumerated(EnumType.STRING)
    @Column(name = "expected_type", length = 20)
    private ExpectedDataType expectedType;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private int sortOrder = 0;
}
