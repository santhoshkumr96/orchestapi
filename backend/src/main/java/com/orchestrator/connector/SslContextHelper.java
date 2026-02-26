package com.orchestrator.connector;

import javax.net.ssl.*;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.Map;

public final class SslContextHelper {

    private SslContextHelper() {}

    public static boolean isSslEnabled(Map<String, Object> config) {
        Object val = config.get("ssl");
        return val != null && "true".equalsIgnoreCase(val.toString().trim());
    }

    public static String getCaCertificate(Map<String, Object> config) {
        Object val = config.get("caCertificate");
        return val != null ? val.toString().trim() : "";
    }

    public static SSLContext createSslContext(String caPem) {
        try {
            SSLContext sslContext = SSLContext.getInstance("TLS");
            if (caPem.isEmpty()) {
                TrustManager[] trustAll = new TrustManager[]{
                    new X509TrustManager() {
                        public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                        public void checkClientTrusted(X509Certificate[] certs, String authType) {}
                        public void checkServerTrusted(X509Certificate[] certs, String authType) {}
                    }
                };
                sslContext.init(null, trustAll, new SecureRandom());
            } else {
                CertificateFactory cf = CertificateFactory.getInstance("X.509");
                X509Certificate caCert = (X509Certificate) cf.generateCertificate(
                        new ByteArrayInputStream(caPem.getBytes(StandardCharsets.UTF_8)));

                KeyStore trustStore = KeyStore.getInstance(KeyStore.getDefaultType());
                trustStore.load(null, null);
                trustStore.setCertificateEntry("ca", caCert);

                TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
                tmf.init(trustStore);

                sslContext.init(null, tmf.getTrustManagers(), new SecureRandom());
            }
            return sslContext;
        } catch (Exception e) {
            throw new RuntimeException("Failed to create SSL context: " + e.getMessage(), e);
        }
    }

    public static SSLSocketFactory createSslSocketFactory(Map<String, Object> config) {
        return createSslContext(getCaCertificate(config)).getSocketFactory();
    }

    public static HostnameVerifier trustAllHostnameVerifier() {
        return (hostname, session) -> true;
    }

    public static boolean shouldTrustAll(Map<String, Object> config) {
        return getCaCertificate(config).isEmpty();
    }
}
