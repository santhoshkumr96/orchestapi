package com.orchestrator.connector;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestrator.model.enums.ConnectorType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import redis.clients.jedis.Jedis;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocketFactory;
import java.util.*;

@Component
@Slf4j
@RequiredArgsConstructor
public class RedisConnector implements InfraConnector {

    private final ObjectMapper objectMapper;

    @Override
    public String execute(ConnectorType type, Map<String, Object> config, String query, int timeoutSeconds) {
        String host = getString(config, "host");
        int port = getInt(config, "port", 6379);
        String password = getString(config, "password");
        int database = getInt(config, "database", 0);
        boolean sslEnabled = SslContextHelper.isSslEnabled(config);

        Jedis jedis;
        if (sslEnabled) {
            SSLSocketFactory sslSocketFactory = SslContextHelper.createSslSocketFactory(config);
            SSLParameters sslParameters = new SSLParameters();
            HostnameVerifier hostnameVerifier = SslContextHelper.shouldTrustAll(config)
                    ? SslContextHelper.trustAllHostnameVerifier()
                    : javax.net.ssl.HttpsURLConnection.getDefaultHostnameVerifier();
            jedis = new Jedis(host, port, timeoutSeconds * 1000, true,
                    sslSocketFactory, sslParameters, hostnameVerifier);
        } else {
            jedis = new Jedis(host, port, timeoutSeconds * 1000);
        }

        try {
            if (!password.isEmpty()) {
                jedis.auth(password);
            }
            if (database > 0) {
                jedis.select(database);
            }

            // Parse query: "COMMAND key [args...]"
            String trimmed = query.trim();
            if (trimmed.isEmpty() || trimmed.equalsIgnoreCase("PING")) {
                String pong = jedis.ping();
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("result", pong);
                return objectMapper.writeValueAsString(r);
            }

            String[] parts = trimmed.split("\\s+", 3);
            String command = parts[0].toUpperCase();

            Map<String, Object> result = new LinkedHashMap<>();

            switch (command) {
                case "GET" -> {
                    String key = parts.length > 1 ? parts[1] : query;
                    String val = jedis.get(key);
                    result.put("value", val);
                    result.put("type", "string");
                    result.put("exists", val != null);
                }
                case "HGET" -> {
                    String key = parts[1];
                    String field = parts.length > 2 ? parts[2] : "";
                    String val = jedis.hget(key, field);
                    result.put("value", val);
                    result.put("type", "hash");
                    result.put("exists", val != null);
                }
                case "HGETALL" -> {
                    String key = parts[1];
                    Map<String, String> val = jedis.hgetAll(key);
                    result.put("value", val);
                    result.put("type", "hash");
                    result.put("exists", val != null && !val.isEmpty());
                }
                case "EXISTS" -> {
                    String key = parts[1];
                    boolean exists = jedis.exists(key);
                    result.put("exists", exists);
                }
                case "LRANGE" -> {
                    String key = parts[1];
                    // Parse "start end" from remaining part
                    String[] range = parts.length > 2 ? parts[2].split("\\s+") : new String[]{"0", "-1"};
                    long start = Long.parseLong(range[0]);
                    long end = range.length > 1 ? Long.parseLong(range[1]) : -1;
                    List<String> val = jedis.lrange(key, start, end);
                    result.put("value", val);
                    result.put("type", "list");
                    result.put("exists", val != null && !val.isEmpty());
                }
                case "SISMEMBER" -> {
                    String key = parts[1];
                    String member = parts.length > 2 ? parts[2] : "";
                    boolean isMember = jedis.sismember(key, member);
                    result.put("isMember", isMember);
                }
                default -> {
                    // Treat as GET with the entire query as key
                    String val = jedis.get(query.trim());
                    result.put("value", val);
                    result.put("type", "string");
                    result.put("exists", val != null);
                }
            }

            return objectMapper.writeValueAsString(result);
        } catch (Exception e) {
            throw new RuntimeException("Redis query failed: " + e.getMessage(), e);
        } finally {
            jedis.close();
        }
    }

    private String getString(Map<String, Object> config, String key) {
        Object val = config.get(key);
        return val != null ? val.toString() : "";
    }

    private int getInt(Map<String, Object> config, String key, int defaultVal) {
        Object val = config.get(key);
        if (val == null) return defaultVal;
        try { return Integer.parseInt(val.toString()); } catch (NumberFormatException e) { return defaultVal; }
    }
}
