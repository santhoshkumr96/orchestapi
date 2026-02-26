package com.orchestrator.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orchestrator.dto.KeyValuePair;
import com.orchestrator.dto.TestStepRequest;
import com.orchestrator.dto.TestStepResponse;
import com.orchestrator.model.HttpMethod;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ImportService {

    private final TestStepService stepService;
    private final ObjectMapper objectMapper;

    public TestStepResponse importFromCurl(UUID suiteId, String curlCommand) {
        TestStepRequest request = parseCurl(curlCommand);
        return stepService.create(suiteId, request);
    }

    public TestStepResponse importFromJson(UUID suiteId, String json) {
        try {
            TestStepRequest request = objectMapper.readValue(json, TestStepRequest.class);
            if (request.getName() == null || request.getName().isBlank()) {
                throw new IllegalArgumentException("JSON must include a non-blank 'name' field");
            }
            if (request.getUrl() == null || request.getUrl().isBlank()) {
                throw new IllegalArgumentException("JSON must include a non-blank 'url' field");
            }
            return stepService.create(suiteId, request);
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid JSON: " + e.getMessage(), e);
        }
    }

    private TestStepRequest parseCurl(String curl) {
        if (curl == null || curl.isBlank()) {
            throw new IllegalArgumentException("curl command is required");
        }

        // Normalize: remove line continuations (backslash + newline) and collapse whitespace
        String normalized = curl.replaceAll("\\\\\\s*\\n", " ")
                .replaceAll("\\\\\\s*\\r\\n", " ")
                .trim();

        // Strip leading 'curl' keyword
        if (normalized.toLowerCase().startsWith("curl")) {
            normalized = normalized.substring(4).trim();
        }

        // Tokenize respecting single and double quotes
        List<String> tokens = tokenize(normalized);

        String method = null;
        String url = null;
        List<KeyValuePair> headers = new ArrayList<>();
        String body = null;

        for (int i = 0; i < tokens.size(); i++) {
            String token = tokens.get(i);

            if (("-X".equals(token) || "--request".equals(token)) && i + 1 < tokens.size()) {
                method = tokens.get(++i).toUpperCase();
            } else if (("-H".equals(token) || "--header".equals(token)) && i + 1 < tokens.size()) {
                String headerStr = tokens.get(++i);
                int colonIdx = headerStr.indexOf(':');
                if (colonIdx > 0) {
                    String key = headerStr.substring(0, colonIdx).trim();
                    String value = headerStr.substring(colonIdx + 1).trim();
                    headers.add(KeyValuePair.builder().key(key).value(value).build());
                }
            } else if (("-d".equals(token) || "--data".equals(token) || "--data-raw".equals(token)
                    || "--data-binary".equals(token)) && i + 1 < tokens.size()) {
                body = tokens.get(++i);
            } else if (!token.startsWith("-") && url == null) {
                // First non-flag token is the URL
                url = token;
            }
            // Skip other flags we don't handle (e.g., --compressed, -k, --insecure, etc.)
        }

        if (url == null || url.isBlank()) {
            throw new IllegalArgumentException("Could not extract URL from curl command");
        }

        // If body is present and no explicit method, default to POST
        if (method == null) {
            method = (body != null) ? "POST" : "GET";
        }

        // Resolve HttpMethod enum
        HttpMethod httpMethod;
        try {
            httpMethod = HttpMethod.valueOf(method);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Unsupported HTTP method: " + method);
        }

        // Extract query params from URL
        List<KeyValuePair> queryParams = new ArrayList<>();
        int qIdx = url.indexOf('?');
        if (qIdx >= 0) {
            String queryString = url.substring(qIdx + 1);
            url = url.substring(0, qIdx);
            for (String param : queryString.split("&")) {
                int eqIdx = param.indexOf('=');
                if (eqIdx > 0) {
                    queryParams.add(KeyValuePair.builder()
                            .key(param.substring(0, eqIdx))
                            .value(param.substring(eqIdx + 1))
                            .build());
                } else if (!param.isBlank()) {
                    queryParams.add(KeyValuePair.builder()
                            .key(param)
                            .value("")
                            .build());
                }
            }
        }

        // Generate step name from URL path
        String name = generateNameFromUrl(url);

        return TestStepRequest.builder()
                .name(name)
                .method(httpMethod)
                .url(url)
                .headers(headers)
                .queryParams(queryParams)
                .body(body != null ? body : "")
                .cacheable(false)
                .cacheTtlSeconds(0)
                .dependencies(new ArrayList<>())
                .responseHandlers(new ArrayList<>())
                .extractVariables(new ArrayList<>())
                .build();
    }

    /**
     * Tokenize a string respecting single and double quotes.
     * Quotes are stripped from the resulting tokens.
     */
    private List<String> tokenize(String input) {
        List<String> tokens = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inSingleQuote = false;
        boolean inDoubleQuote = false;

        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);

            if (c == '\'' && !inDoubleQuote) {
                inSingleQuote = !inSingleQuote;
            } else if (c == '"' && !inSingleQuote) {
                inDoubleQuote = !inDoubleQuote;
            } else if (Character.isWhitespace(c) && !inSingleQuote && !inDoubleQuote) {
                if (!current.isEmpty()) {
                    tokens.add(current.toString());
                    current.setLength(0);
                }
            } else {
                current.append(c);
            }
        }
        if (!current.isEmpty()) {
            tokens.add(current.toString());
        }

        return tokens;
    }

    /**
     * Generate a step name from a URL by extracting the path, stripping leading slash,
     * replacing slashes with dashes, and truncating to 50 characters.
     */
    private String generateNameFromUrl(String rawUrl) {
        String path;
        try {
            // Remove protocol + host to get path
            String afterProtocol = rawUrl;
            int protocolEnd = rawUrl.indexOf("://");
            if (protocolEnd >= 0) {
                afterProtocol = rawUrl.substring(protocolEnd + 3);
            }
            int pathStart = afterProtocol.indexOf('/');
            if (pathStart >= 0) {
                path = afterProtocol.substring(pathStart);
            } else {
                // No path — use the host as the name
                path = "/" + afterProtocol;
            }
        } catch (Exception e) {
            path = "/imported-step";
        }

        // Strip query string
        int queryIdx = path.indexOf('?');
        if (queryIdx >= 0) {
            path = path.substring(0, queryIdx);
        }

        // Strip leading slash, replace remaining slashes with dashes
        if (path.startsWith("/")) {
            path = path.substring(1);
        }
        String name = path.replace("/", "-");

        // Fallback if empty
        if (name.isBlank()) {
            name = "imported-step";
        }

        // Truncate to 50 chars
        if (name.length() > 50) {
            name = name.substring(0, 50);
        }

        return name;
    }
}
