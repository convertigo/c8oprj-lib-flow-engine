# HTTP transports

The Java helper `SharedHttpClients` reuses stateless JDK HTTP transports across isolated runtimes of the same library class-loader generation. It retains at most eight clients, keyed by connection timeout. A change to the default SSL context or proxy selector invalidates this cache. Headers, bodies, authentication and response data stay on individual requests; no cookie handler or authenticator is installed.

The helper creates transport threads with the platform class loader, then restores the caller loader. A live transport must not prevent an old project/library generation from being collected. Eviction only drops the cache reference: in-flight requests keep their client. The Java 17 API has no client close method; the JDK reclaims unused clients.

When the helper is absent, `http.request` keeps its JavaScript fallback. The request read timeout and redirect policy are unchanged. The helper path honors each requested connection timeout, including when a reused runtime sees a different value.

`tests/http-client-reuse.cjs` runs the Java contract: concurrent requests, absence of shared cookies/identity, connection timeout separation, SSL/proxy replacement, bounded retention and class-loader collection. `http-basic-auth-form-body.js` covers the block with and without the helper on the classpath. Build `libs/build` with `tools/LibsBuild.java` after source edits.
