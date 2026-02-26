package com.orchestrator.connector;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import com.orchestrator.model.enums.ConnectorType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.bson.BsonDocument;
import org.bson.Document;
import org.springframework.stereotype.Component;

import javax.net.ssl.SSLContext;
import java.util.*;
import java.util.concurrent.TimeUnit;

@Component
@Slf4j
@RequiredArgsConstructor
public class MongoConnector implements InfraConnector {

    private final ObjectMapper objectMapper;

    @Override
    public String execute(ConnectorType type, Map<String, Object> config, String query, int timeoutSeconds) {
        String connectionString = getString(config, "connectionString");
        if (connectionString.isEmpty()) {
            // Build from parts
            String host = getString(config, "host");
            int port = getInt(config, "port", 27017);
            String username = getString(config, "username");
            String password = getString(config, "password");
            String database = getString(config, "database");

            if (!username.isEmpty() && !password.isEmpty()) {
                connectionString = "mongodb://" + username + ":" + password + "@" + host + ":" + port + "/" + database;
            } else {
                connectionString = "mongodb://" + host + ":" + port + "/" + database;
            }
        }

        // Apply SSL to connection string
        boolean sslEnabled = SslContextHelper.isSslEnabled(config);
        if (sslEnabled) {
            String separator = connectionString.contains("?") ? "&" : "?";
            connectionString += separator + "tls=true";
            if (SslContextHelper.shouldTrustAll(config)) {
                connectionString += "&tlsAllowInvalidCertificates=true";
            }
        }

        // Extract database name from connection string or config
        String dbName = getString(config, "database");

        // Test connection: empty query = just connect and list collections
        if (query == null || query.trim().isEmpty()) {
            try (MongoClient client = createMongoClient(connectionString, config, sslEnabled)) {
                MongoDatabase db = client.getDatabase(dbName.isEmpty() ? "admin" : dbName);
                List<String> collectionNames = new ArrayList<>();
                db.listCollectionNames().forEach(collectionNames::add);
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("connected", true);
                r.put("database", db.getName());
                r.put("collections", collectionNames);
                return objectMapper.writeValueAsString(r);
            } catch (Exception e) {
                throw new RuntimeException("MongoDB connection failed: " + e.getMessage(), e);
            }
        }

        // Parse query: "collection.{filterJson}" e.g. "orders.{\"orderId\":\"abc\"}"
        int dotIndex = query.indexOf('.');
        if (dotIndex < 0) {
            throw new RuntimeException("Invalid MongoDB query format. Expected: collection.{filter}");
        }
        String collectionName = query.substring(0, dotIndex);
        String filterJson = query.substring(dotIndex + 1);

        try (MongoClient client = createMongoClient(connectionString, config, sslEnabled)) {
            MongoDatabase db = client.getDatabase(dbName);
            MongoCollection<Document> collection = db.getCollection(collectionName);

            BsonDocument filter = BsonDocument.parse(filterJson);
            List<Map<String, Object>> documents = new ArrayList<>();
            collection.find(filter)
                    .maxTime(timeoutSeconds, TimeUnit.SECONDS)
                    .forEach(doc -> documents.add(new LinkedHashMap<>(doc)));

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("documents", documents);
            result.put("count", documents.size());
            return objectMapper.writeValueAsString(result);
        } catch (Exception e) {
            throw new RuntimeException("MongoDB query failed: " + e.getMessage(), e);
        }
    }

    private MongoClient createMongoClient(String connectionString, Map<String, Object> config, boolean sslEnabled) {
        if (!sslEnabled) {
            return MongoClients.create(connectionString);
        }

        String caPem = SslContextHelper.getCaCertificate(config);
        if (!caPem.isEmpty()) {
            SSLContext sslContext = SslContextHelper.createSslContext(caPem);
            MongoClientSettings settings = MongoClientSettings.builder()
                    .applyConnectionString(new ConnectionString(connectionString))
                    .applyToSslSettings(builder -> builder.enabled(true).context(sslContext))
                    .build();
            return MongoClients.create(settings);
        }

        return MongoClients.create(connectionString);
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
