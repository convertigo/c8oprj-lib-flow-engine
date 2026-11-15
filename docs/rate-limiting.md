# Server rate limits

`rate.check` is a backend block with three operations. `peek` checks without counting,
`hit` counts one event and reports whether that event was allowed **before** it was
counted; on a refused hit, its retry delay reflects the newly counted event.
`reset` clears the counter. All return
`{ allowed, retryAfterSeconds, count }`; invalid input fails closed as data.
Use a stable `bucket` for each quota and a normalized `key`.

For login, `peek` by normalized identifier before `password.verify`, whether or
not the account exists. On failure, `hit`; on success, `reset`. Check a second
bucket keyed by `request.clientAddress` before hashing. For signup, `hit` the
address quota before `password.hash`, and check for an existing account first.
The caller chooses its own error envelope when `allowed` is false.

`request.clientAddress` reads Convertigo `context.remoteAddr`, set by
`ServletRequester` from `HttpServletRequest.getRemoteAddr()` (and propagated to
internal requests). Proxy handling is determined by the configured servlet
container. This value never comes from a Flow-supplied or raw `X-Forwarded-For`
header. A request without a Convertigo client address yields an empty string;
an address quota with that key fails closed.

The sliding-window counters live in server memory. They are shared by Flows on
one Convertigo server instance, and are independent across instances; a restart
clears them. The LRU table has at most `maxEntries` keys (default 10,000,
maximum 100,000). Eviction clears an old key. With `backoff: true`, a limit
reached starts a one-second delay; subsequent blocked `hit` calls double it,
up to `maxDelaySeconds`. After the delay, a retry can proceed even if the
sliding window still contains earlier failures. With `backoff: false`, the
quota reopens when enough events leave the window.
