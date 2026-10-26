import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import javax.net.ssl.SSLContext;
import com.convertigo.libflowengine.SharedHttpClients;

class HttpClientReuseTest {
    static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    static Object[] detachedGeneration() throws Exception {
        var directory = SharedHttpClients.class.getProtectionDomain().getCodeSource().getLocation();
        var loader = new URLClassLoader(new URL[] {directory}, ClassLoader.getPlatformClassLoader());
        var previous = Thread.currentThread().getContextClassLoader();
        try {
            Thread.currentThread().setContextClassLoader(loader);
            var type = loader.loadClass("com.convertigo.libflowengine.SharedHttpClients");
            var client = (HttpClient) type.getMethod("get", long.class).invoke(null, 1000L);
            return new Object[] {new java.lang.ref.WeakReference<>(loader), client};
        } finally { Thread.currentThread().setContextClassLoader(previous); loader.close(); }
    }
    public static void main(String[] args) throws Exception {
        var loader = Thread.currentThread().getContextClassLoader();
        var first = SharedHttpClients.get(1000);
        check(first == SharedHttpClients.get(1000), "same timeout must reuse transport");
        check(first != SharedHttpClients.get(2000), "different timeout must have its own transport");
        check(SharedHttpClients.get(2000).connectTimeout().orElseThrow().toMillis() == 2000, "connection timeout preserved");
        check(first.cookieHandler().isEmpty() && first.authenticator().isEmpty(), "no ambient request identity");
        check(Thread.currentThread().getContextClassLoader() == loader, "caller loader restored");
        try { SharedHttpClients.get(0); throw new AssertionError("invalid timeout accepted"); }
        catch (IllegalArgumentException expected) { }
        var server = com.sun.net.httpserver.HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            String marker = exchange.getRequestHeaders().getFirst("X-Fixture-Owner");
            byte[] reply = (marker == null ? "missing" : marker).getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Set-Cookie", "fixture=ignored");
            if (exchange.getRequestHeaders().getFirst("Cookie") != null) reply = "unexpected cookie".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, reply.length); exchange.getResponseBody().write(reply); exchange.close();
        });
        var workers = Executors.newFixedThreadPool(20);
        server.start();
        try {
            var tasks = new ArrayList<Future<?>>();
            for (int i = 0; i < 20; i++) {
                String owner = "owner-" + i;
                tasks.add(workers.submit(() -> {
                    try {
                        check(first == SharedHttpClients.get(1000), "concurrent reuse");
                        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + server.getAddress().getPort()))
                            .header("X-Fixture-Owner", owner).build();
                        for (int n = 0; n < 2; n++) check(owner.equals(first.send(request, HttpResponse.BodyHandlers.ofString()).body()), "request headers and cookies stay isolated");
                    } catch (Exception e) { throw new AssertionError(e); }
                }));
            }
            for (var task : tasks) task.get(15, TimeUnit.SECONDS);
        } finally { workers.shutdownNow(); server.stop(0); }
        var originalSsl = SSLContext.getDefault();
        try {
            var replacement = SSLContext.getInstance("TLS"); replacement.init(null, null, null);
            SSLContext.setDefault(replacement);
            check(first != SharedHttpClients.get(1000), "TLS generation invalidates transports");
            check(SharedHttpClients.get(1000).sslContext() == replacement, "new TLS configuration used");
        } finally { SSLContext.setDefault(originalSsl); }
        var originalProxy = ProxySelector.getDefault();
        try {
            var before = SharedHttpClients.get(1000);
            var replacement = new ProxySelector() {
                public List<Proxy> select(URI uri) { return List.of(Proxy.NO_PROXY); }
                public void connectFailed(URI uri, SocketAddress address, java.io.IOException failure) { }
            };
            ProxySelector.setDefault(replacement);
            check(before != SharedHttpClients.get(1000), "proxy generation invalidates transports");
            check(SharedHttpClients.get(1000).proxy().orElseThrow() == replacement, "new proxy configuration used");
        } finally { ProxySelector.setDefault(originalProxy); }
        for (int i = 1; i <= 32; i++) SharedHttpClients.get(i);
        var cache = SharedHttpClients.class.getDeclaredField("clients"); cache.setAccessible(true);
        check(((Map<?,?>) cache.get(null)).size() == 8, "retained transport cache is bounded");
        check(Thread.currentThread().getContextClassLoader() == loader, "loader restored after replacements");
        var detached = detachedGeneration();
        var generation = (java.lang.ref.WeakReference<?>) detached[0];
        for (int i = 0; i < 50 && generation.get() != null; i++) { System.gc(); Thread.sleep(20); }
        check(generation.get() == null, "live transport must not retain library generation");
        check(detached[1] instanceof HttpClient, "transport stays reachable during generation check");
        System.out.println("PASS shared HTTP transports: identity, timeouts, 40 concurrent responses, cookies, TLS/proxy invalidation, bound and class loader");
    }
}
