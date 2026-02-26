package com.orchestrator.connector;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestrator.model.enums.ConnectorType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.*;
import org.apache.kafka.common.PartitionInfo;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.*;

@Component
@Slf4j
@RequiredArgsConstructor
public class KafkaConnector implements InfraConnector {

    private final ObjectMapper objectMapper;

    @Override
    public String execute(ConnectorType type, Map<String, Object> config, String query, int timeoutSeconds) {
        Properties props = new Properties();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, getString(config, "brokers"));
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "orch-verify-" + UUID.randomUUID());
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "latest");
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "false");

        String securityProtocol = getString(config, "securityProtocol");
        if (!securityProtocol.isEmpty()) {
            props.put("security.protocol", securityProtocol);
        }
        String saslMechanism = getString(config, "saslMechanism");
        if (!saslMechanism.isEmpty()) {
            props.put("sasl.mechanism", saslMechanism);
        }
        String saslUsername = getString(config, "saslUsername");
        String saslPassword = getString(config, "saslPassword");
        if (!saslUsername.isEmpty() && !saslPassword.isEmpty()) {
            props.put("sasl.jaas.config",
                    "org.apache.kafka.common.security.plain.PlainLoginModule required username=\"" +
                            saslUsername + "\" password=\"" + saslPassword + "\";");
        }

        // SSL/TLS support
        boolean sslEnabled = SslContextHelper.isSslEnabled(config);
        if (sslEnabled) {
            if (securityProtocol.isEmpty()) {
                props.put("security.protocol", "SSL");
            }
            if (SslContextHelper.shouldTrustAll(config)) {
                props.put("ssl.endpoint.identification.algorithm", "");
            }
            String caPem = SslContextHelper.getCaCertificate(config);
            if (!caPem.isEmpty()) {
                File trustStoreFile = createTempTrustStore(caPem);
                props.put("ssl.truststore.location", trustStoreFile.getAbsolutePath());
                props.put("ssl.truststore.password", "changeit");
                props.put("ssl.truststore.type", "JKS");
            }
        }

        // Parse query: "topic=X key=Y"
        Map<String, String> params = parseParams(query);
        String topic = params.getOrDefault("topic", "");
        String keyFilter = params.get("key");

        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props)) {
            // Test connection: empty query = just list topics
            if (topic.isEmpty()) {
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("connected", true);
                r.put("topics", consumer.listTopics(Duration.ofSeconds(timeoutSeconds)).keySet());
                return objectMapper.writeValueAsString(r);
            }

            // Use assign + seekToEnd instead of subscribe for instant readiness
            // (subscribe triggers slow group coordinator rebalance protocol)
            List<PartitionInfo> partitionInfos = consumer.partitionsFor(topic, Duration.ofSeconds(timeoutSeconds));
            List<TopicPartition> topicPartitions = partitionInfos.stream()
                    .map(p -> new TopicPartition(topic, p.partition()))
                    .toList();
            consumer.assign(topicPartitions);
            consumer.seekToEnd(topicPartitions);

            long deadline = System.currentTimeMillis() + (timeoutSeconds * 1000L);

            while (System.currentTimeMillis() < deadline) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(Math.min(1000, deadline - System.currentTimeMillis())));

                for (ConsumerRecord<String, String> record : records) {
                    // If key filter specified, only match that key
                    if (keyFilter != null && !keyFilter.equals(record.key())) {
                        continue;
                    }

                    Map<String, Object> result = new LinkedHashMap<>();
                    result.put("found", true);
                    result.put("key", record.key());
                    // Try to parse value as JSON, otherwise use as string
                    try {
                        result.put("value", objectMapper.readTree(record.value()));
                    } catch (Exception e) {
                        result.put("value", record.value());
                    }
                    result.put("partition", record.partition());
                    result.put("offset", record.offset());
                    result.put("timestamp", record.timestamp());
                    return objectMapper.writeValueAsString(result);
                }
            }

            // Timeout — message not found
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("found", false);
            result.put("timeout", true);
            return objectMapper.writeValueAsString(result);
        } catch (Exception e) {
            throw new RuntimeException("Kafka consume failed: " + e.getMessage(), e);
        }
    }

    private File createTempTrustStore(String caPem) {
        try {
            CertificateFactory cf = CertificateFactory.getInstance("X.509");
            X509Certificate cert = (X509Certificate) cf.generateCertificate(
                    new ByteArrayInputStream(caPem.getBytes(StandardCharsets.UTF_8)));
            KeyStore ks = KeyStore.getInstance("JKS");
            ks.load(null, "changeit".toCharArray());
            ks.setCertificateEntry("ca", cert);
            File tmpFile = File.createTempFile("kafka-truststore-", ".jks");
            tmpFile.deleteOnExit();
            try (FileOutputStream fos = new FileOutputStream(tmpFile)) {
                ks.store(fos, "changeit".toCharArray());
            }
            return tmpFile;
        } catch (Exception e) {
            throw new RuntimeException("Failed to create Kafka truststore: " + e.getMessage(), e);
        }
    }

    private Map<String, String> parseParams(String query) {
        Map<String, String> params = new LinkedHashMap<>();
        // Support newline-separated (new) and space-separated (legacy) formats
        String separator = query.contains("\n") ? "\n" : "\\s+";
        for (String part : query.trim().split(separator)) {
            String trimmed = part.trim();
            if (trimmed.isEmpty()) continue;
            String[] kv = trimmed.split("=", 2);
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
}
