/* Copyright (c) 2001-2026 Convertigo SA. AGPL-3.0-or-later. */
package com.convertigo.libflowengine;

import java.io.*;
import java.net.*;
import java.nio.charset.*;
import java.util.*;
import java.util.concurrent.*;
import org.apache.http.*;
import org.apache.http.auth.*;
import org.apache.http.client.methods.HttpUriRequest;
import org.apache.http.entity.ContentType;
import org.apache.http.impl.client.*;
import org.apache.http.impl.conn.DefaultProxyRoutePlanner;
import org.apache.http.conn.routing.HttpRoute;
import org.apache.http.protocol.HttpContext;
import com.twinsoft.convertigo.engine.Engine;
import com.twinsoft.convertigo.engine.EnginePropertiesManager.ProxyMode;
import com.twinsoft.convertigo.engine.EnginePropertiesManager.ProxyMethod;

/** Per-call destination and response limits. Settings belong to the server, never to a relayed argument. */
public final class HttpAccess {
    private static final ScheduledThreadPoolExecutor TIMER = new ScheduledThreadPoolExecutor(1, task -> {
        var thread = new Thread(task, "flow-http-deadline"); thread.setDaemon(true); thread.setContextClassLoader(Engine.class.getClassLoader()); return thread;
    });
    private static final ThreadPoolExecutor DNS = new ThreadPoolExecutor(2, 4, 30, TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(64), task -> { var thread = new Thread(task, "flow-http-dns"); thread.setDaemon(true); thread.setContextClassLoader(Engine.class.getClassLoader()); return thread; });
    static { TIMER.setRemoveOnCancelPolicy(true); TIMER.setKeepAliveTime(30, TimeUnit.SECONDS); TIMER.allowCoreThreadTimeOut(true); }
    private HttpAccess() {}

    public static IOException refused() { return new IOException("HTTP_DESTINATION_REFUSED: HTTP destination is not allowed."); }
    private static String host(String host) {
        host = host.toLowerCase(Locale.ROOT);
        if (host.startsWith("[") && host.endsWith("]")) host = host.substring(1, host.length()-1);
        while (host.endsWith(".")) host = host.substring(0, host.length()-1);
        return host;
    }
    // Exact host names or literal IPs, comma separated. No suffix matching and no request-owned configuration.
    public static boolean allowedHost(String name) {
        name = host(name);
        for (var entry : System.getProperty("convertigo.flow.http.allowedHosts", "").split(","))
            if (!entry.isBlank() && name.equals(host(entry.trim()))) return true;
        return false;
    }
    public static boolean publicAddress(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
            || address.isSiteLocalAddress() || address.isMulticastAddress()) return false;
        byte[] b = address.getAddress();
        if (b.length == 4) {
            int a=b[0]&255, c=b[1]&255;
            return a != 0 && a != 127 && a < 224 && !(a == 100 && c >= 64 && c <= 127)
                && !(a == 198 && (c == 18 || c == 19));
        }
        // Global unicast only: also excludes unique-local, mapped local, unspecified and scoped addresses.
        return (b[0]&0xe0) == 0x20 && address instanceof Inet6Address v6 && v6.getScopeId() == 0;
    }
    public static InetAddress[] checkAddresses(String name, InetAddress[] addresses) throws IOException {
        if (addresses.length == 0) throw refused();
        if (!allowedHost(name)) for (var address : addresses) if (!publicAddress(address)) throw refused();
        return addresses;
    }
    public static void checkUri(URI uri) throws IOException {
        if (!("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
            || uri.getHost() == null || uri.getUserInfo() != null || uri.getRawAuthority().contains("%")) throw refused();
    }
    private static InetAddress[] resolve(String name, Budget budget) throws IOException {
        budget.check();
        Future<InetAddress[]> future;
        try { future = DNS.submit(() -> InetAddress.getAllByName(name)); }
        catch (RejectedExecutionException busy) { throw new IOException("HTTP_DNS_BUSY: DNS workers are occupied."); }
        try { return checkAddresses(name, future.get(budget.remaining(), TimeUnit.NANOSECONDS)); }
        catch (TimeoutException expired) { future.cancel(true); throw new IOException("HTTP_TOTAL_TIMEOUT: HTTP deadline exceeded."); }
        catch (InterruptedException stopped) { future.cancel(true); Thread.currentThread().interrupt(); throw new IOException("HTTP call interrupted."); }
        catch (ExecutionException failed) { throw new IOException("HTTP name resolution failed.", failed.getCause()); }
    }
    /** A call owns its client. DNS is checked at the connection itself; no second unchecked lookup occurs. */
    public static CloseableHttpClient client(Budget budget) {
        var builder = HttpClients.custom().disableAutomaticRetries().disableRedirectHandling().disableCookieManagement()
            .setDnsResolver(name -> {
                try { return resolve(name, budget); }
                catch (IOException refused) { var failure = new UnknownHostException(refused.getMessage()); failure.initCause(refused); throw failure; }
            });
        var app = Engine.theApp;
        if (app != null && app.proxyManager != null && app.proxyManager.proxyMode == ProxyMode.manual) {
            var manager = app.proxyManager;
            var proxy = new HttpHost(manager.getProxyServer(), manager.getProxyPort());
            builder.setRoutePlanner(new DefaultProxyRoutePlanner(proxy) {
                @Override public HttpRoute determineRoute(HttpHost target, HttpRequest request, HttpContext context) throws HttpException {
                    for (var domain : manager.getBypassDomains()) if (target.getHostName().equals(domain)) return new HttpRoute(target, null, "https".equals(target.getSchemeName()));
                    // A proxy resolves the target itself. Such targets require an explicit trusted-host exception.
                    if (!allowedHost(target.getHostName())) throw new HttpException("HTTP_DESTINATION_REFUSED: Proxied hosts require allowedHosts.");
                    return super.determineRoute(target, request, context);
                }
            });
            if (manager.proxyMethod == ProxyMethod.basic) {
                var credentials = new BasicCredentialsProvider();
                credentials.setCredentials(new AuthScope(proxy.getHostName(), proxy.getPort()),
                    new UsernamePasswordCredentials(manager.getProxyUser(), manager.getProxyPassword()));
                builder.setDefaultCredentialsProvider(credentials);
            }
        }
        return builder.build();
    }
    public static long setting(String name, long fallback, long max) {
        try { long value = Long.parseLong(System.getProperty(name, "")); if (value > 0 && value <= max) return value; }
        catch (NumberFormatException ignored) {}
        return fallback;
    }
    public static Budget budget() {
        return new Budget(setting("convertigo.flow.http.totalTimeoutMs", 60000, 300000),
            setting("convertigo.flow.http.maxResponseBytes", 16777216, 67108864));
    }
    public static final class Budget {
        private final long deadline;
        private long bytes;
        public Budget(long timeoutMs, long maxBytes) {
            if (timeoutMs <= 0 || timeoutMs > 300000 || maxBytes <= 0 || maxBytes > 67108864) throw new IllegalArgumentException("Invalid HTTP limits");
            deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs); bytes = maxBytes;
        }
        public long remaining() throws IOException { check(); return deadline - System.nanoTime(); }
        public void check() throws IOException {
            if (Thread.currentThread().isInterrupted() || System.nanoTime() >= deadline) throw new IOException("HTTP_TOTAL_TIMEOUT: HTTP deadline exceeded.");
        }
        public void destination(URI uri) throws IOException {
            checkUri(uri);
            var name = host(uri.getHost());
            var app = Engine.theApp;
            if (app != null && app.proxyManager != null && app.proxyManager.proxyMode == ProxyMode.manual) {
                var bypass = false;
                for (var domain : app.proxyManager.getBypassDomains()) if (name.equals(host(domain))) { bypass = true; break; }
                if (!bypass) {
                    // The proxy resolves this host. Only server-approved names may take that route.
                    if (!allowedHost(name)) throw refused();
                    return;
                }
            }
            resolve(name, this);
        }
        public ScheduledFuture<?> watch(HttpUriRequest request) throws IOException {
            return TIMER.schedule(request::abort, Math.max(0, remaining()), TimeUnit.NANOSECONDS);
        }
        public String read(HttpEntity entity) throws IOException {
            if (entity == null) return "";
            var type = ContentType.get(entity);
            var charset = type != null && type.getCharset() != null ? type.getCharset() : StandardCharsets.UTF_8;
            // Closing an entity stream may drain its remainder. The caller closes the response/connection instead.
            return read(entity.getContent(), charset);
        }
        public String readFile(File file) throws IOException {
            try (var stream = new FileInputStream(file)) {
                var close = TIMER.schedule(() -> { try { stream.close(); } catch (IOException ignored) {} }, Math.max(0, remaining()), TimeUnit.NANOSECONDS);
                try { return read(stream, StandardCharsets.UTF_8); } finally { close.cancel(false); }
            }
        }
        private String read(InputStream stream, Charset charset) throws IOException {
            try {
                var output = new ByteArrayOutputStream(); byte[] buffer = new byte[8192];
                while (true) {
                    check(); int count = stream.read(buffer, 0, (int)Math.min(buffer.length, bytes + 1)); check();
                    if (count < 0) break;
                    if (count > bytes) throw new IOException("HTTP_RESPONSE_TOO_LARGE: HTTP response exceeds its byte limit.");
                    bytes -= count; output.write(buffer, 0, count);
                }
                return output.toString(charset);
            } catch (IOException failure) {
                check(); throw failure;
            }
        }
    }
}
