package com.orchestrator.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.orchestrator.model.enums.MockMatchRuleType;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "orchestapi_mock_match_rules", schema = "orchestrator")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MockMatchRule {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "endpoint_id", nullable = false)
    @JsonIgnore
    private MockEndpoint endpoint;

    @Enumerated(EnumType.STRING)
    @Column(name = "rule_type", nullable = false, length = 20)
    private MockMatchRuleType ruleType;

    @Column(name = "match_key", nullable = false, length = 200)
    private String matchKey;

    @Column(name = "match_value", length = 500)
    private String matchValue;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private int sortOrder = 0;
}
