# Native object results and opt-in row results

The materialized object boundary remains the default. `runObject(requestJson,
detach)` returns the owning Java detachment token while its original realm is
borrowed. `detach.sanitize` fuses the ordinary-data policy and detachment walk;
exotic values use the existing whole-value policy exactly once. The servlet
writes detached JSON directly. This path does not stringify and reparse results.

Row results are a separate, explicit protocol, implemented by the Java
`ResultDocument`, `PagedJsonRows`, `RowProducerRuntime` and `JsonResponse` owners.
They require the matching Java engine and lib_flow_engine 0.1.106. An old bridge
rejects a requested row result before opening its source.

## Plan and transfer

Trusted backend blocks can call `ctx.createRowsPlan(spec)` and then the terminal
`ctx.resultWithRows(handle, field, fields)`. The first method registers a private
identity capability. The second transfers it once and stops the current Flow.
Neither JSON markers nor an ordinary runtime handle can manufacture a row source.
Handles remain forbidden in ordinary results. Traces can see only the empty
array/metadata declaration or the standard safe handle summary; they never get
headers, credentials, producer source or an HTTP resource.

The plan has these required parts:

- `http`: authorized `url`, `headers`, `items` and `next` JSON pointers,
  `connectTimeout`, `readTimeout`, known-value `redactions`, and `dropKeys`.
- `limits`: `pages`, `inputRows`, `inputBytes`, `rows`, `bytes`, `rowBytes`,
  `precommitRows`, `precommitBytes`, `rowNodes`, `stringCharacters`, `depth`,
  and `millis`. Java validates all bounds; missing bounds are errors.
- `transform`: declared Rhino block names in `blocks`, optional declared engine
  `libraries`, an `entry` block, optional `finish` block, and detached `input`.
- `take`: intentional first-N semantics, distinct from the hard row limit.
  Zero requests all rows within the hard limit.
- `collect:true`: an explicit materializing operator boundary. The input rows
  and transformed result must both fit the declared row/byte budgets.

The engine snapshots the declared block/library source strings, its producer
bootstrap, and input while the invocation is still alive. The Java plan owns a
private copy of input. No Flow scope, closure, request Context, session, variable
map or caller-owned handle is retained. The captured project classloader is the
same generation bound for the original authorized invocation.

## Detached producer execution

At consumption, a response-owned producer leases one of 32 execution permits on
its writer thread. Every lease creates a new realm: project code can modify
intrinsic prototypes, so a realm is discarded on release. Only immutable
compiled scripts are shared through the engine's regular script cache. This
trades a bounded initialization cost for isolation between consecutive requests.
Pool overflow fails with 503 before commitment; all exit paths return the permit.

The producer's deliberately limited context provides `props`, literal `template`
and `expr`, `input`, `canContinue`, `callBlock` for declared dependencies, `lib`
for declared libraries, and private `rowState`. It has no ambient `context`,
session or inherited request MDC. Literal cell strings cannot become templates.
The producer binds its captured classloader and restores the previous TCCL,
Rhino language setting and MDC in finally. HTTP reads and producer code run with
logging suppressed, including resource closure.

For ordinary mode the entry receives `{row,input,index}` and returns one plain
JSON object, or null to skip it. The finish block receives `{input,count}` and
returns bounded terminal metadata. For collection the entry receives
`{rows,input}` and returns `{rows,metadata}`. A bounded `{failure,status}` result
can preserve an established precommit business-error envelope. Collection
finishes and detaches before the first row is emitted, then releases its realm.

Producer results cannot contain handles, accessors, arbitrary host objects,
functions or custom prototypes. Ordinary object cycles retain the engine's
`[Circular]` normalization; cyclic arrays fail. No producer value from Rhino
escapes to the writer. Custom declared blocks must keep their operator state
bounded; arbitrary backend JavaScript is not a memory sandbox. The BaseRow
producer retains a bounded column plan and field metadata, and never appends
ordinary-mode rows into that state.

## HTTP input and authority

The cursor parses a Jackson `JsonParser` directly over the HTTP entity stream.
It builds one detached object from the selected array, never a page String or a
whole-page JSON object. It closes a page before requesting the next one. There
is no producer queue, background prefetch, or whole-array buffer in ordinary
mode. Parser buffers, individual rows, strings, names, depth and nodes are bounded.

The default continuation policy requires the same scheme, host, port and exact
path as the authorized initial request; redirects are disabled. An optional
`http.pageParameter` instead extracts one bounded positive integer from the
returned token/query and changes only that query parameter on the original URL.
Returned origin, path, other filters and query values confer no authority. This
mode supports reverse proxies whose Baserow pagination URLs advertise another
origin, without sending credentials to that origin. Repeated reconstructed
pages, malformed or duplicated tokens, row/page/byte overflow and timeouts fail
with stable errors. Errors/logs never retain raw URLs, headers or response bodies.

The pooled engine HTTP client preserves its proxy/TLS settings. A standalone
client is owned and closed by the source. Disconnect/cancellation aborts the
current HTTP request; no later page is fetched.

## Output, errors and consumers

Before any writer or JSONP prefix is committed, `prepare()` stages a configured
number of rows under a byte bound. A first-page, transform or validation failure
in that phase preserves the established HTTP error status and `{error:...}`
shape. When the complete result fits in staging, terminal metadata and source
closure are also checked before commitment. This is a bounded rollback window,
not a promise of atomic success for every row of a large response.

After commitment a recoverable producer error closes the array and appends
terminal `error` and `complete:false`. Success appends `complete:true`. A consumer
must wait for the complete JSON document and reject `complete:false` before
using any rows. A write/flush error aborts immediately without an error suffix.
The adapter checks PrintWriter errors at every row flush, including JSONP.
Output accounting includes row payloads, separators, framing and metadata;
a small bounded terminal error envelope may exceed the success byte budget.

The document is one-shot and has an explicit discard path. The servlet owns it
through header preparation, writing and cleanup. Context reset closes an
unselected document; transfer removes it from the Context. XML/XPath, internal
requestables, REST adapters, unsupported project JSON options, cache, billable
requestables and custom controllers collect under the same bounds before the
legacy projection. A partial read never causes the Flow to execute again.
Same-engine nested Flow composition cannot forward a row capability; it must use
the materializing requestable boundary. Default calls retain ordinary value
semantics.

Normal access checks still run before plan construction. The engine captures a
single billing Ticket before the request Context can be reset. Response closure
adds producer/writer time and publishes that ticket once, including abandonment
and error. Final status and completeness are transient ticket properties
available to billing managers; this change does not migrate the SQL schema.

## BaseRow adoption

lib_BaseRow 1.2.0-flow-native.7 and lib_flow_baserow 0.2.0-port.5 expose
`stream_rows` (boolean, default false) on GetTableData and GetSelectData. Their
existing owner/configuration checks, revision invalidation, token refresh,
filtering and sorting execute before creating the page plan. Formatting and
schema logic remain in the provider; the Java engine has no Baserow knowledge.

Ordinary mode is bounded to 1,000 pages, 50,000 rows, 64 MiB output, 128 MiB input,
256 KiB per row, 512 KiB precommit staging and a 60-second cursor deadline.
The deadline is checked at cursor operations; it does not preempt arbitrary
trusted JavaScript that fails to return.
`max_search_results` remains an intentional take limit. Sorting is sent upstream.
Model, distinct, groups and aggregate operations select explicit collection,
limited to 2,000 rows and 32 MiB; larger requested limits fail before row reads.
They do not claim bounded memory independent of row count.

C8Oforms is intentionally unchanged. Its source callbacks currently consume the
whole decoded response and do not reject `complete:false`. SDK 4.0.29 recognizes
an error envelope only through its configurable error-to-failure policy, which
is false by default. Before a C8Oforms caller opts in, it must reject partial
responses before dispatching source callbacks. Server streaming saves server
retention; it does not provide a progressive table UI through that SDK.

## Validation

Java task `:engine:rowStreamingTest` covers one-shot ownership, staging, early and
late failures, metadata/close failures, disconnect, abandonment, cancellation,
XML collection, billing, independent realms, source/classloader snapshots,
prototype isolation, pool exhaustion, parser chunks, numeric-token authority,
redirects, timeouts and resource/size bounds. Provider tests include the last-page
lean-field contract and literal strings. Live parity, final matrices, retained
heap evidence and Linux replay instructions belong to the accompanying mission
report and validation bundle; unit tests alone are not a shipping claim.
