# HTTP transport of http.request

`http.request` (and its shortcuts `http.get`, `http.post`, `http.put`, `http.delete`) sends every request with the HTTP
client of the Convertigo engine, and only with it: `Engine.theApp.httpClient4` when the engine runs (its connection pool
and its proxy settings: manual mode, bypassed hosts, basic proxy authentication), read at each call because the engine
replaces it when these settings change; otherwise, in a standalone runtime, `HttpUtils.makeHttpClient(false)`, created
and closed by the call. There is no second client and no fallback: a request reaches the server once.

## Sent once

Every request carries an entity, empty without a body (`Content-Length: 0`, as the JDK client used until 0.1.114 sent
it). The retry handler of the engine client repeats a request with an entity only when it failed before being sent
(a stale pooled connection), never after: a timeout, a connection cut once the request is written or a response the
client cannot read is an error of the call. A parallel chunk whose thread is interrupted (a chunk after a failed one)
sends nothing more: `FLOW_EXECUTION_CANCELLED` (499). An exchange already in progress is not cut by the interruption:
it ends with its response or its read timeout.

## Timeouts

`connectTimeoutMs` bounds the connection and the wait for a free connection of the pool (a saturated pool fails
instead of waiting for ever); `readTimeoutMs` is the socket timeout, the longest wait for data from the server. Both
default to 60000 and take a positive number of milliseconds (`HTTP_TIMEOUT_INVALID` otherwise).

## Cookies

The engine client keeps a cookie store shared by all its requests: a request executed without its own context would
send the cookies another user received. `http.request` never uses it (the request configuration ignores cookies) and
manages cookies itself, at each step of the redirections, with the cookie interceptors of httpclient 4 (RFC 6265, as
browsers) over a cookie context of the call:

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

`tests/http-engine-client.js` covers a single send on errors and timeouts, cookie isolation and persistence, the
redirections, the timeouts and the engine proxy settings; `http-engine-client-shared-scope.js` runs it in a scope
shaped like the one of a call of the shared runtime; `http-basic-auth-form-body.js` covers authentication and bodies.
