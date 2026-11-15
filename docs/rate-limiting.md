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

The counters live in server memory. They are shared by Flows on one Convertigo
server instance, and are independent across instances; a restart clears them.
Each key holds only a count, a fixed window end, and the last hit time. The
window starts with the first hit and renews after `windowSeconds`; it does not
track individual event times. A busy key therefore uses constant memory, and
the boundary may allow a burst across two consecutive windows.

Each bucket has its own table of at most `maxEntries` keys (default 10,000,
maximum 100,000). If calls specify different capacities for the same bucket,
the smallest capacity seen applies until the bucket becomes empty. At capacity,
`peek` and `hit` refuse a new key with `count: 0` and a retry time based on the
earliest window expiry. They never evict a live counter. Expired keys are
removed when capacity is needed; `reset` also frees a slot. An existing key
continues to work while its bucket is full. The server holds at most 1,024
buckets; a new bucket also fails closed when that limit is reached. Bucket
names are limited to 128 characters and keys to 512 characters.

With `backoff: true`, reaching the limit starts a one-second delay; subsequent
blocked `hit` calls double it, up to `maxDelaySeconds`. After the delay, a retry
can proceed even while the fixed window contains earlier failures. With
`backoff: false`, the quota reopens at the fixed window boundary.
