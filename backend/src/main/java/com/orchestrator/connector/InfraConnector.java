package com.orchestrator.connector;

import com.orchestrator.model.enums.ConnectorType;
import java.util.Map;

public interface InfraConnector {
    String execute(ConnectorType type, Map<String, Object> config, String query, int timeoutSeconds);
}
