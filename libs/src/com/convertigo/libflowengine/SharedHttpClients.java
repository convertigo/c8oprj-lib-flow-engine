/* Copyright (c) 2001-2026 Convertigo SA. AGPL-3.0-or-later. */
package com.convertigo.libflowengine;

import java.net.ProxySelector;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.LinkedHashMap;
import javax.net.ssl.SSLContext;
import java.security.NoSuchAlgorithmException;

/** Bounded stateless transports, shared by runtimes of the same library generation. */
public final class SharedHttpClients {
    private static final int LIMIT = 8;
    private static final LinkedHashMap<Long, HttpClient> clients = new LinkedHashMap<>(LIMIT, .75f, true);
    private static SSLContext sslContext;
    private static ProxySelector proxySelector;
    private SharedHttpClients() { }

    public static synchronized HttpClient get(long connectTimeoutMs) throws NoSuchAlgorithmException {
        if (connectTimeoutMs <= 0) throw new IllegalArgumentException("Connection timeout must be positive");
        var ssl = SSLContext.getDefault();
        var proxy = ProxySelector.getDefault();
        if (ssl != sslContext || proxy != proxySelector) {
            clients.clear();
            sslContext = ssl;
            proxySelector = proxy;
        }
        var client = clients.get(connectTimeoutMs);
        if (client == null) {
            var thread = Thread.currentThread();
            var previous = thread.getContextClassLoader();
            try {
                // Transport workers must not keep the project/library class loader alive.
                thread.setContextClassLoader(ClassLoader.getPlatformClassLoader());
                var builder = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(connectTimeoutMs))
                    .sslContext(ssl).followRedirects(HttpClient.Redirect.NORMAL);
                if (proxy != null) builder.proxy(proxy);
                client = builder.build();
            } finally { thread.setContextClassLoader(previous); }
            if (clients.size() == LIMIT) clients.remove(clients.keySet().iterator().next());
            clients.put(connectTimeoutMs, client);
        }
        return client;
    }
}
