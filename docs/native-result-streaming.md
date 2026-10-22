# Object results and proposed row streams

Status, 2026-10-22: **the object result protocol is implemented** in local engine
0.1.100 and the matching Java engine. **The row-stream APIs below are a design,
not available blocks or Java interfaces yet.** No provider must call them until
their implementation and lifecycle tests land.

## Implemented execution boundary

`Engine.run(requestJson)` keeps its string response contract. Java execution
feature-detects `Engine.runObject(requestJson, detach)`. This operation performs
the same run and result policy, then calls `detach(envelope)`
inside its structured-error boundary. It must return the exact token supplied
by that callback. The callback makes fresh JSONObject/JSONArray containers and
immutable Java scalars while the runtime is borrowed. No Scriptable, function,
prototype, getter, Java host object or realm reference crosses this boundary.
Aliases are copied independently. Only JSON scalar values are shared.

Since local engine 0.1.105, bridges may expose `detach.sanitize(envelope, policy)`.
Ordinary data trees are checked, sanitized and detached in one Java walk, without
an intermediate Rhino tree. If any accessor, host value, custom prototype, array
map/species or conversion hook needs the provider policy, the speculative copy is
discarded before executing user code and the original policy runs exactly once.
This retains getter/toJSON order, handle rejection and cycle behavior. Cyclic
arrays that exhaust the old sanitizer are reported as a structured result error.
Result writes keep their eager handle guard: mutable trees can change afterwards.

The copy preserves JSON omission/null rules, sparse arrays, own keys including
`__proto__`, `toJSON`, finite numbers and the existing Java scalar conversion.
Getters and `toJSON` finish before the runtime is released. Cycles and BigInts
that reach the JSON boundary fail there, within the run error envelope. The
provider sanitizer owns exceptional-value and diagnostic handle policies. Standalone synchronous callers may omit `detach` and receive the
sanitized JavaScript object; **they do not receive an object detached from their
realm** and must not retain it as a servlet response.

Authoring/MCP methods keep their existing text APIs. Providers without
`runObject` retain the legacy bridge. No HTTP switch selects the new protocol.
The same detached result can be projected to typed JSON, wrapped for JSONP,
copied into an internal caller's realm, or converted to XML when the requester,
project options or attachment projection require it. Existing access checks,
context isolation and billing stay in the requestable lifecycle.

`JsonResponse` writes detached values after execution. Boundary-owned container
types permit direct escaped-string writes, preserving JSON options and UTF-16
escaping without constructing another escaped String for each cell/key. Its servlet entry point
owns/closes the writer and checks PrintWriter's error state after flushing.
An I/O failure cannot retain a runtime lease because detachment and release have
already completed. This is **incremental serialization of a materialized result**,
not bounded-memory row production. The input request still uses the existing
text protocol. Profiling marks `functionCall.responseMode = "object"`; Java
invocation duration includes detachment. There is no fictitious stringify time.

## Proposed generic output contract

The Java engine should introduce an internal, non-JSON `ResultDocument` owning
detached scalar/container fields plus one or more typed `RowSource` fields.
Conceptual Java API:

```java
interface RowSource extends AutoCloseable {
    // Null means end; a row is a detached JSON object, never a Scriptable.
    JSONObject next() throws IOException;
    void close() throws IOException; // idempotent, including before first next
}
```

The writer owns the document and sources in try/finally, writes one detached row
and drops it before pulling the next. No unbounded producer queue, background
prefetch or whole-array buffer is part of v1. The memory bound is one row plus
parser/HTTP/writer buffers, configuration and explicitly bounded operator state.
A huge individual row still consumes memory; row/depth/string/byte limits are
required. `distinct` costs O(unique keys); global sort/group/aggregate costs
O(input) unless pushed upstream or explicitly materialized. These operations
must never be advertised as bounded-memory streaming.

A source is a runtime-owned capability, not a magic JSON marker users can forge.
Ordinary handles remain forbidden in result. A dedicated terminal block (working
name `result.withRows`) transfers a registered source to a registered result
field. Ownership moves exactly once; another consumer or a second serialization
fails before output starts. Sanitization, traces, schemas and MCP return only its
declared array item schema and safe status, never its resource/credentials.
Arbitrary iterators, getters, functions and host objects remain rejected.

Crucially, no source captures the current Flow scope, closures, Context, variable
maps, request object, project classloader generation in mutable globals, or
handles belonging to the completed invocation. A JS producer must be compiled
to an immutable source/transform plan plus detached input/config. At first pull
a dedicated execution owner acquires a fresh exclusive runtime lease on the
writer's thread (or a worker with bounded synchronous handoff). It binds the
captured project generation and explicitly permitted services, initializes its
own locals and restores TCCL/MDC/context in finally. It must never resume the
scope that produced the result token. Pure Java cursors need no Rhino lease.
Cancellation and close release parser, HTTP body, operator state and any producer
lease. The document also has a discard path if serialization is never selected.

The proposed Flow surface is a scoped producer/consumer graph, not an arbitrary
JavaScript callback or a user-supplied Java class name. Working vocabulary:

- `http.withJsonItems`: open one permitted HTTP response, select a JSON array by
  a bounded pointer, expose one item at a time to child nodes, close in finally.
- `rows.withPages`: execute a declared page plan sequentially; expose detached
  page metadata and items; continue with a validated next-page token.
- `rows.emit`: terminal emission of one detached result row. Backpressure is the
  synchronous return from the consumer/writer.
- `rows.collect`: an explicit, limited materialization boundary for an ordinary
  array consumer. Limits are mandatory, with a structured error on overflow.

Names and descriptors require implementation review. They are deliberately
generic: no Baserow endpoints, field schemas, HTML formatting or session rules
belong in lib_flow_engine or the Java cursor/writer.

## Proposed paged HTTP input

Use a streaming JSON parser over the HTTP entity InputStream. Visit the selected
array and construct only one row; do not call `readAll`, make a body String,
parse an entire page into JSONObject, or append pages into `allRows`. Parse the
remaining document for declared metadata such as a next token, with bounded
metadata size. If metadata needed before the first row appears after the array,
the declared contract must either defer it to a trailer field, use a separate
metadata request, or explicitly buffer under a limit. Do not silently re-read
the page or accumulate all rows.

Fetch the next page only after the previous entity/parser is closed and demand
remains. The page plan supplies request configuration, item pointer, next-token
pointer and optional transforms. Reuse existing HTTP services, timeouts, trusted
host configuration, proxy/TLS policy, header masking and authorization context.
Never forward credentials to an unvalidated `next` URL or redirect. Constrain
scheme/origin/path, redirect policy, page count, total rows/bytes, elapsed time
and repeated tokens. Prefer interpreting an opaque token through a configured
URL template; do not grant an arbitrary returned URL authority.

On cancellation, disconnect, parser error or transform exception, close the
current entity and prevent further fetches. No tokens, headers, raw URLs with
credentials or raw upstream bodies enter traces, error details or evidence.

## Consumers, errors and lifecycle

Before headers/body commitment, access/security checks and project JSON options
must already have run. Preflight the first page and validate the row contract
before any irreversible output, under a bounded staging buffer. Errors there
retain the established HTTP status and `{error: ...}` shape. The precise staging
bound must be configurable and tested; it cannot promise rollback for all data.

After commitment, a JSON stream cannot promise the original atomic error
response. V1 should use an explicitly opt-in response contract permitting a
terminal `error` field and a `complete:false` indication, with array closure only
when syntax is recoverable. A write/disconnect error aborts immediately: do not
try to append an error to a dead socket. A caller that requires the historic
all-or-error contract must collect under a limit or use the old materialized
path. JSONP must follow exactly the same commitment and cleanup rules.

Flow-to-Flow calls must preserve their existing value semantics by default:
consume/collect the source before returning an ordinary caller-owned array.
Streaming composition is a separate typed capability and exclusive ownership
transfer. XML/XPath, unsupported JSON options, attachments, schema-driven REST,
cache, billable requestables and custom controllers use an explicit materializing
adapter or the established XML path **before** consuming a one-shot stream.
No retry may execute the request twice after a partial read.

Keep one billing ticket per requestable and all four existing access checks.
The present requestable ends before the servlet writes; a streaming revision
must specify how response-owned execution duration, cancellation and final status
reach that ticket without inserting a second ticket or using a reset shared
Context. This is a required engine lifecycle change and test, not an assumption
that the existing finally automatically covers later producer I/O. Session and
context cleanup must wait for ownership to close or capture only immutable
authorized state; security cannot rely on a previously released mutable context.

## Adoption by the BaseRow provider

No change is needed to benefit from the implemented object boundary. For future
streaming, the provider should build a page plan instead of collecting all rows,
keep its exact per-row formatting/column ordering/null/hidden/HTML/lean rules,
and emit the same public `data` rows. Implement row transforms in the provider,
invoked from the generic plan; do not move Baserow formatting into the engine.
Retain metadata and bounded field descriptors once per response. Preserve the
meaning of max_search_results, distinct, sorting, grouping, aggregation and
owner/account checks. Route unsupported global operations to an explicit
materialized path. Agree on post-commit errors with consumers before opting in.

## Required evidence before shipping row streams

1. Unit lifecycle matrix: never consumed, empty, one/many rows, success, first
   page error, later page error, transform error, invalid JSON, repeated next
   token, timeout/cancel, disconnect, close throwing, double close/consume and
   abandonment. Each owned resource closes exactly once; no next page after stop.
2. Scope isolation: concurrent/nested streams, caller reuse before write,
   failure during binding/pull/write, classloader update, cancellation and pool
   exhaustion. No source-realm references; no active lease after close.
3. Boundary parity: typed JSON/JSONP, own special keys, Unicode/nulls/numbers,
   XML/XPath and `_flow.xml.arrayItem`, REST schema/options, attachments, status
   before/after commit, access denial and one billing ticket per nested call.
4. HTTP tests on a local deterministic server: split tokens across chunks,
   metadata before/after items, malformed/truncated pages, denied cross-origin
   next/redirect, bounded rows/bytes/depth and body closure on each exit.
5. Re-run the 39 BaseRow parity cases and its 12-test batch/6 table cases, plus
   new later-page failures and cancellation. Compare complete positive bodies.
6. Repeat the mission-4 protocol (20/200 rows, 1/5 clients, alternated native and
   Flow, validated descendant-thread allocation probe). Also use large synthetic
   row counts to demonstrate a bounded retained heap; 200 rows alone cannot prove
   streaming. Include producer work and writer work in allocation attribution.
   Keep uninstrumented timing separate and disclose Studio context serialization.
