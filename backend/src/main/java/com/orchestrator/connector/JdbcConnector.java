package com.orchestrator.connector;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestrator.model.enums.ConnectorType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.sql.*;
import java.util.*;
import java.util.regex.Pattern;

@Component
@Slf4j
@RequiredArgsConstructor
public class JdbcConnector implements InfraConnector {

    private final ObjectMapper objectMapper;

    private static final Pattern READ_ONLY_PATTERN = Pattern.compile(
            "^\\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|WITH)\\b",
            Pattern.CASE_INSENSITIVE
    );

    @Override
    public String execute(ConnectorType type, Map<String, Object> config, String query, int timeoutSeconds) {
        validateReadOnly(query);

        String jdbcUrl = buildJdbcUrl(type, config);
        String username = getString(config, "username");
        String password = getString(config, "password");

        try (Connection conn = DriverManager.getConnection(jdbcUrl, username, password)) {
            conn.setReadOnly(true);
            conn.setNetworkTimeout(Runnable::run, timeoutSeconds * 1000);
            try (Statement stmt = conn.createStatement()) {
                stmt.setQueryTimeout(timeoutSeconds);
                try (ResultSet rs = stmt.executeQuery(query)) {
                    ResultSetMetaData meta = rs.getMetaData();
                    int colCount = meta.getColumnCount();
                    List<Map<String, Object>> rows = new ArrayList<>();

                    while (rs.next()) {
                        Map<String, Object> row = new LinkedHashMap<>();
                        for (int i = 1; i <= colCount; i++) {
                            row.put(meta.getColumnLabel(i), rs.getObject(i));
                        }
                        rows.add(row);
                    }

                    Map<String, Object> result = new LinkedHashMap<>();
                    result.put("rows", rows);
                    result.put("rowCount", rows.size());
                    return objectMapper.writeValueAsString(result);
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("JDBC query failed: " + e.getMessage(), e);
        }
    }

    private String buildJdbcUrl(ConnectorType type, Map<String, Object> config) {
        String host = getString(config, "host");
        String port = getString(config, "port");
        String database = getString(config, "database");
        boolean sslEnabled = SslContextHelper.isSslEnabled(config);

        String baseUrl = switch (type) {
            case MYSQL -> "jdbc:mysql://" + host + ":" + port + "/" + database;
            case POSTGRES -> "jdbc:postgresql://" + host + ":" + port + "/" + database;
            case ORACLE -> "jdbc:oracle:thin:@" + host + ":" + port + "/" + database;
            case SQLSERVER -> "jdbc:sqlserver://" + host + ":" + port + ";databaseName=" + database;
            default -> throw new IllegalArgumentException("Unsupported JDBC type: " + type);
        };

        if (!sslEnabled) return baseUrl;

        boolean trustAll = SslContextHelper.shouldTrustAll(config);

        return switch (type) {
            case MYSQL -> baseUrl + "?useSSL=true&requireSSL=true&verifyServerCertificate=" + !trustAll;
            case POSTGRES -> trustAll
                    ? baseUrl + "?ssl=true&sslfactory=org.postgresql.ssl.NonValidatingFactory"
                    : baseUrl + "?ssl=true&sslmode=verify-ca";
            case ORACLE -> baseUrl + "?oracle.net.ssl_version=1.2";
            case SQLSERVER -> baseUrl + ";encrypt=true;trustServerCertificate=" + trustAll;
            default -> baseUrl;
        };
    }

    private void validateReadOnly(String query) {
        if (query == null || query.trim().isEmpty()) {
            throw new IllegalArgumentException("Query cannot be empty");
        }
        if (!READ_ONLY_PATTERN.matcher(query).find()) {
            throw new IllegalArgumentException(
                    "Only read operations are allowed. Permitted: SELECT, SHOW, DESCRIBE, EXPLAIN, WITH. " +
                    "Write operations (INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE, etc.) are not permitted.");
        }
    }

    private String getString(Map<String, Object> config, String key) {
        Object val = config.get(key);
        return val != null ? val.toString() : "";
    }
}
