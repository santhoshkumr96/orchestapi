package com.orchestrator.connector;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestrator.model.enums.ConnectorType;
import com.rabbitmq.client.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

@Component
@Slf4j
@RequiredArgsConstructor
public class RabbitMqConnector implements InfraConnector {

    private final ObjectMapper objectMapper;

    @Override
    public String execute(ConnectorType type, Map<String, Object> config, String query, int timeoutSeconds) {
        boolean sslEnabled = SslContextHelper.isSslEnabled(config);

        ConnectionFactory factory = new ConnectionFactory();
        factory.setHost(getString(config, "host"));
        factory.setPort(getInt(config, "port", sslEnabled ? 5671 : 5672));
        String virtualHost = getString(config, "virtualHost");
        if (!virtualHost.isEmpty()) {
            factory.setVirtualHost(virtualHost);
        }
        String username = getString(config, "username");
        if (!username.isEmpty()) factory.setUsername(username);
        String password = getString(config, "password");
        if (!password.isEmpty()) factory.setPassword(password);

        if (sslEnabled) {
            try {
                javax.net.ssl.SSLContext sslContext = SslContextHelper.createSslContext(
                        SslContextHelper.getCaCertificate(config));
                factory.useSslProtocol(sslContext);
            } catch (Exception e) {
                throw new RuntimeException("Failed to configure RabbitMQ SSL: " + e.getMessage(), e);
            }
        }

        factory.setConnectionTimeout(timeoutSeconds * 1000);

        // Parse query: "queue=X" or "queue=X routingKey=Y"
        Map<String, String> params = parseParams(query);
        String queueName = params.getOrDefault("queue", "");
        String routingKeyFilter = params.get("routingKey");

        try (Connection connection = factory.newConnection();
             Channel channel = connection.createChannel()) {

            // Test connection: empty queue = just verify connectivity
            if (queueName.isEmpty()) {
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("connected", true);
                r.put("channelNumber", channel.getChannelNumber());
                return objectMapper.writeValueAsString(r);
            }

            BlockingQueue<Map<String, Object>> resultQueue = new LinkedBlockingQueue<>();

            String consumerTag = channel.basicConsume(queueName, false,
                    (tag, delivery) -> {
                        String routingKey = delivery.getEnvelope().getRoutingKey();
                        // If routing key filter specified, only match that
                        if (routingKeyFilter != null && !routingKeyFilter.equals(routingKey)) {
                            channel.basicNack(delivery.getEnvelope().getDeliveryTag(), false, true);
                            return;
                        }

                        String body = new String(delivery.getBody(), StandardCharsets.UTF_8);
                        Map<String, Object> result = new LinkedHashMap<>();
                        result.put("found", true);
                        result.put("routingKey", routingKey);
                        // Try to parse as JSON
                        try {
                            result.put("body", objectMapper.readTree(body));
                        } catch (Exception e) {
                            result.put("body", body);
                        }
                        // Convert headers
                        Map<String, Object> headers = new LinkedHashMap<>();
                        if (delivery.getProperties().getHeaders() != null) {
                            delivery.getProperties().getHeaders().forEach((k, v) ->
                                    headers.put(k, v != null ? v.toString() : null));
                        }
                        result.put("headers", headers);

                        channel.basicAck(delivery.getEnvelope().getDeliveryTag(), false);
                        resultQueue.offer(result);
                    },
                    tag -> {}
            );

            Map<String, Object> result = resultQueue.poll(timeoutSeconds, TimeUnit.SECONDS);
            channel.basicCancel(consumerTag);

            if (result != null) {
                return objectMapper.writeValueAsString(result);
            }

            // Timeout
            Map<String, Object> timeout = new LinkedHashMap<>();
            timeout.put("found", false);
            timeout.put("timeout", true);
            return objectMapper.writeValueAsString(timeout);
        } catch (Exception e) {
            throw new RuntimeException("RabbitMQ consume failed: " + e.getMessage(), e);
        }
    }

    private Map<String, String> parseParams(String query) {
        Map<String, String> params = new LinkedHashMap<>();
        for (String part : query.trim().split("\\s+")) {
            String[] kv = part.split("=", 2);
            if (kv.length == 2) {
                params.put(kv[0].trim(), kv[1].trim());
            }
        }
        return params;
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
