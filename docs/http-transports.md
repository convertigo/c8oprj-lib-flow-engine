# HTTP transport of http.request

`http.request` and its shortcuts use the project `HttpAccess` helper and a client owned by the call. This allows the
DNS resolver used by the connection to enforce the same destination policy as the initial URL and each redirect.
The engine's manual proxy, bypassed hosts and basic proxy credentials are read at each call. The shared engine pool
cannot supply a per-call DNS policy and is no longer used. HTTP calls require the matching `libs/build` classes.

## Destinations

Only HTTP and HTTPS are accepted; user information and scoped addresses in the URI are refused. Resolved loopback,
link-local, private, unspecified, multicast and shared-address-space destinations are refused by default, including
mixed public/private DNS answer sets. The resolver checks the addresses it returns to the connecting socket.

Set the JVM property `convertigo.flow.http.allowedHosts` to a comma-separated list of exact trusted DNS names or IP
literals to allow exceptions. This is server configuration, never a Flow input or project config. A trusted name
allows all addresses it resolves to; no wildcard or suffix matching is used. Redirects to another origin also require
an allowed destination host, following the default origin restriction of the engine transaction destination policy
(`HttpUriOverridePolicy` and `HttpConnector.checkRedirectDestination`). That transaction policy has no reusable
resolved-address check. Scheme downgrades remain refused. A proxy resolves targets itself: a proxied target requires
an explicit allowed-host entry, and the proxy's own resolved address is checked too.

`file:` requires `allowFileUrl:true` and root author permission, including for debug execution. This is an explicit
privileged local read; applications should use `file.readText` under `_private/flow-data` instead.

## Sent once

Every request carries an entity, empty without a body (`Content-Length: 0`). Automatic retries are disabled. A parallel
chunk whose thread is interrupted sends nothing more: `FLOW_EXECUTION_CANCELLED` (499).

## Timeouts

`connectTimeoutMs` bounds connection establishment; `readTimeoutMs` bounds socket inactivity. Both default to 60000.
The following JVM properties add server-owned limits that apply to every shortcut, response type and redirect:

| Property | Default | Maximum |
| --- | --- | --- |
| `convertigo.flow.http.maxResponseBytes` | 16777216 (16 MiB) | 67108864 (64 MiB) |
| `convertigo.flow.http.totalTimeoutMs` | 60000 | 300000 |

Limits must be positive integers; an absent or invalid setting uses its default. The byte budget counts actual
content after decompression. A scheduled abort enforces the total deadline during connection and body reads; DNS
work also has that deadline and a bounded worker count. Redirect bodies are closed without draining them. Local
file reads use the same byte and elapsed-time limits. Refusals use `HTTP_DESTINATION_REFUSED` (403),
`HTTP_RESPONSE_TOO_LARGE` (502), `HTTP_TOTAL_TIMEOUT` (504) or `HTTP_DNS_BUSY` (503); local-file opt-in failures use
`HTTP_FILE_REFUSED` (403). The existing Flow error envelope remains unchanged.

## Cookies

`http.request` manages cookies at each redirect with the httpclient 4 interceptors (RFC 6265) over a cookie context
of the call. Automatic cookie management on the transport client is disabled:

- `cookies: "context"` (default): the `HttpState` of the Convertigo context of the call (`context.httpState`, created
  when missing), where the HTTP connectors keep theirs. A call of a named context sends the cookies received by the
  previous calls of that context (and by its HTTP connectors); two contexts never share a cookie. The Redis store of
  the contexts keeps them across instances. Commons-httpclient 3 cookies are converted to httpclient 4 cookies and back
  at each use; a domain cookie is kept with a leading dot, which the Redis store preserves. A parallel chunk uses the
  `HttpState` of its caller, resolved on the calling thread (`HttpState` methods are synchronized). The cookie store
  over the `HttpState` is built with `new JavaAdapter(CookieStore, ...)`: in the shared runtime of the server
  (`convertigo.javascript.stateless=true`), the scope of a call owns the Java packages of its project but not
  `JavaAdapter`, and Rhino cannot implement an interface given to `new` there (`new CookieStore({...})` fails).
- `cookies: "request"`, or a run without Convertigo context (standalone, a Flow called directly by another one): the
  cookies received are kept for the redirections of this call only.

## Redirections

The call follows them itself, as the JDK client did (NORMAL policy): 301, 302, 303, 307 and 308 with a valid
`Location`, to the same scheme or to https (never from https to http), at most 5 responses (the fifth is returned as
is). 303, and a POST redirected by 301 or 302, become a GET without body; otherwise the method and the body are kept.
A redirection to another origin drops the `Authorization`, `Cookie`, `Origin`, `Referer` and `Host` headers given by the
Flow. A redirection without a valid `Location` is returned as is (the JDK client failed on it).

## Other differences with the JDK client (0.1.114)

- HTTP/1.1 only; `Accept-Encoding: gzip,deflate` is sent and compressed responses are decoded (their
  `content-encoding` and `content-length` headers are then absent from `headers`).
- The response text is decoded with the charset of its `Content-Type`, UTF-8 when it has none (the JDK client always
  used UTF-8).
- `Content-Length` and `Transfer-Encoding` headers given by the Flow are ignored: the client computes them.
- The URL path is sent as written (no normalization).
- TLS uses the default trust store of the JVM, without the client key store of the JVM (`javax.net.ssl.keyStore`), as
  the other HTTP calls of the engine; the JVM proxy properties are not read, the engine proxy settings are.

## Shared runtime

The implementation is stateless (0.1.118): its module holds constants, Java classes and thread-safe httpclient objects
(the cookie interceptors, immutable, and the registry of cookie specifications, whose providers create their
specification once, synchronized); the cookie context, the request, the response, the redirections and the timeouts of a
call live in the functions called for it. A shared runtime evaluates it once instead of once per call frame, and its
classes come from the class path of the engine (`flowEngineClass`), never from a copy in the libraries of a project.

`tests/boundary-http-runtime.js` checks the complete standalone Engine transport, initial destination refusals, explicit
exceptions, cross-origin redirects and discarded redirect bodies. `tests/HttpAccessBoundaryTest.java` checks address
classes, mixed DNS sets, byte boundaries, decompression and an actively aborted slow stream. The historical
`tests/http-engine-client.js` assumes shared-client reuse and unrestricted loopback; its deployment-specific proxy
and context checks must be qualified with the new policy on a live engine.
