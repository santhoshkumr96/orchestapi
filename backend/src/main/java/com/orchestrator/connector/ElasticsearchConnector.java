package com.orchestrator.connector;

import com.orchestrator.model.enums.ConnectorType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URI;
import java.util.*;

@Component
@Slf4j
@RequiredArgsConstructor
public class ElasticsearchConnector implements InfraConnector {

    private final RestTemplate restTemplate;

    @Override
    public String execute(ConnectorType type, Map<String, Object> config, String query, int timeoutSeconds) {
        String baseUrl = getString(config, "url");
        String username = getString(config, "username");
        String password = getString(config, "password");

        // Parse query: "METHOD /path body" e.g. "GET /orders/_search {...}"
        String method = "GET";
        String path;
        String body = null;

        String trimmed = query.trim();
        if (trimmed.matches("^(GET|POST|PUT|DELETE)\\s+.*")) {
            String[] parts = trimmed.split("\\s+", 3);
            method = parts[0];
            path = parts[1];
            body = parts.length > 2 ? parts[2] : null;
        } else {
            // Assume the whole query is the path
            path = trimmed;
        }

        String fullUrl = baseUrl.replaceAll("/+$", "") + (path.startsWith("/") ? path : "/" + path);

        boolean sslEnabled = SslContextHelper.isSslEnabled(config);
        RestTemplate rt = restTemplate;

        if (sslEnabled) {
            // Enforce https
            if (fullUrl.startsWith("http://")) {
                fullUrl = "https://" + fullUrl.substring(7);
            }
            SSLContext sslContext = SslContextHelper.createSslContext(SslContextHelper.getCaCertificate(config));
            boolean trustAll = SslContextHelper.shouldTrustAll(config);
            SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory() {
                @Override
                protected void prepareConnection(HttpURLConnection connection, String httpMethod) throws IOException {
                    if (connection instanceof HttpsURLConnection httpsConn) {
                        httpsConn.setSSLSocketFactory(sslContext.getSocketFactory());
                        if (trustAll) {
                            httpsConn.setHostnameVerifier(SslContextHelper.trustAllHostnameVerifier());
                        }
                    }
                    super.prepareConnection(connection, httpMethod);
                }
            };
            rt = new RestTemplate(factory);
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (!username.isEmpty() && !password.isEmpty()) {
            headers.setBasicAuth(username, password);
        }

        HttpEntity<String> entity = new HttpEntity<>(body, headers);

        ResponseEntity<String> response = rt.exchange(
                URI.create(fullUrl),
                HttpMethod.valueOf(method),
                entity,
                String.class
        );

        return response.getBody() != null ? response.getBody() : "{}";
    }

    private String getString(Map<String, Object> config, String key) {
        Object val = config.get(key);
        return val != null ? val.toString() : "";
    }
}
