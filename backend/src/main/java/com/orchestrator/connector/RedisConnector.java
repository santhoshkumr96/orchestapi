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

    private static final Set<String> ALLOWED_COMMANDS = Set.of(
            "PING", "GET", "MGET", "KEYS", "EXISTS", "TYPE", "TTL", "PTTL", "DBSIZE", "INFO",
            "HGET", "HGETALL", "HMGET", "HKEYS", "HVALS", "HLEN", "HEXISTS",
            "LRANGE", "LLEN", "LINDEX",
            "SMEMBERS", "SCARD", "SISMEMBER", "SRANDMEMBER",
            "ZRANGE", "ZRANGEBYSCORE", "ZCARD", "ZSCORE", "ZCOUNT", "ZRANK",
            "STRLEN", "GETRANGE", "SCAN", "HSCAN", "SSCAN", "ZSCAN",
            "OBJECT", "RANDOMKEY", "DUMP"
    );

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

            if (!ALLOWED_COMMANDS.contains(command)) {
                throw new IllegalArgumentException(
                        "Only read operations are allowed. '" + command + "' is not permitted. " +
                        "Allowed commands: GET, MGET, KEYS, EXISTS, TYPE, TTL, HGET, HGETALL, HMGET, HKEYS, HVALS, " +
                        "LRANGE, LLEN, SMEMBERS, SCARD, SISMEMBER, ZRANGE, ZCARD, ZSCORE, SCAN, INFO, DBSIZE, PING, etc.");
            }

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
                case "MGET" -> {
                    String keysStr = parts.length > 1 ? trimmed.substring(command.length()).trim() : "";
                    String[] keys = keysStr.split("\\s+");
                    List<String> vals = jedis.mget(keys);
                    result.put("values", vals);
                    result.put("type", "string");
                }
                case "KEYS" -> {
                    String pattern = parts.length > 1 ? parts[1] : "*";
                    Set<String> keys = jedis.keys(pattern);
                    result.put("keys", keys);
                    result.put("count", keys.size());
                }
                case "TYPE" -> {
                    String key = parts[1];
                    String keyType = jedis.type(key);
                    result.put("type", keyType);
                }
                case "TTL" -> {
                    String key = parts[1];
                    long ttl = jedis.ttl(key);
                    result.put("ttl", ttl);
                }
                case "LLEN" -> {
                    String key = parts[1];
                    long len = jedis.llen(key);
                    result.put("length", len);
                }
                case "SMEMBERS" -> {
                    String key = parts[1];
                    Set<String> members = jedis.smembers(key);
                    result.put("value", members);
                    result.put("type", "set");
                    result.put("exists", !members.isEmpty());
                }
                case "SCARD" -> {
                    String key = parts[1];
                    long card = jedis.scard(key);
                    result.put("count", card);
                }
                case "ZRANGE" -> {
                    String key = parts[1];
                    String[] range = parts.length > 2 ? parts[2].split("\\s+") : new String[]{"0", "-1"};
                    long start = Long.parseLong(range[0]);
                    long end = range.length > 1 ? Long.parseLong(range[1]) : -1;
                    List<String> vals = jedis.zrange(key, start, end);
                    result.put("value", vals);
                    result.put("type", "zset");
                }
                case "ZCARD" -> {
                    String key = parts[1];
                    long card = jedis.zcard(key);
                    result.put("count", card);
                }
                case "ZSCORE" -> {
                    String key = parts[1];
                    String member = parts.length > 2 ? parts[2] : "";
                    Double score = jedis.zscore(key, member);
                    result.put("score", score);
                    result.put("exists", score != null);
                }
                case "DBSIZE" -> {
                    long size = jedis.dbSize();
                    result.put("size", size);
                }
                case "INFO" -> {
                    String section = parts.length > 1 ? parts[1] : null;
                    String info = section != null ? jedis.info(section) : jedis.info();
                    result.put("info", info);
                }
                case "STRLEN" -> {
                    String key = parts[1];
                    long len = jedis.strlen(key);
                    result.put("length", len);
                }
                case "HLEN" -> {
                    String key = parts[1];
                    long len = jedis.hlen(key);
                    result.put("length", len);
                }
                case "HKEYS" -> {
                    String key = parts[1];
                    Set<String> keys = jedis.hkeys(key);
                    result.put("keys", keys);
                    result.put("count", keys.size());
                }
                case "HEXISTS" -> {
                    String key = parts[1];
                    String field = parts.length > 2 ? parts[2] : "";
                    boolean hexists = jedis.hexists(key, field);
                    result.put("exists", hexists);
                }
                default -> {
                    // Command is in ALLOWED_COMMANDS but not explicitly handled — use generic GET as fallback
                    String val = jedis.get(parts.length > 1 ? parts[1] : trimmed);
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
