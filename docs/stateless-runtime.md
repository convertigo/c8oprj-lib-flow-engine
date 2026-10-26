# Experimental shared execution runtime

The server can select the revision-scoped runtime with the JVM property
`convertigo.javascript.stateless=true`. It is disabled by default. Studio,
authoring entry points, providers without the protocol marker, and requests with
nonempty source working copies continue through the existing runtime path.

The provider advertises `stateless-v1` on the first line of `Engine.js` and exposes
`supportsStatelessExecution`. The Java bridge owns the revision, keyed by provider,
project directory, project classloader and code/data generations. Notifications
invalidate future acquisitions; in-flight calls keep their revision. External
file changes have a periodic fingerprint fallback.

`FlowRuntimeApi.prepare` serializes preparation and publishes code/metadata once.
It must never receive request inputs, sessions, runtime handles or results. The
scope of each invocation inherits sealed standard objects and shared engine code.
Lexical request bindings resolve through a Java thread-local stack; nested calls
restore the previous frame even when execution throws.

Catalog contracts and reachable execution plans are frozen before publication.
Unused optional blocks remain lazy. Plans hold resolved block functions, compiled
input contracts, input expressions, output writers and ordered execution chains.
Values between blocks remain ordinary JavaScript values.

## Rhino implementation contract

An implementation may export `stateless: true` alongside `run` and `prepareNode`
only when its exports and captured variables contain no mutable invocation state.
Its prepared runners must accept all request state through `ctx`. Preparation may
capture immutable node properties and compiled expression functions; it must not
capture a request, session, result, runtime handle or a mutable per-call cache.
Freezing an export object does **not** freeze the variables captured by functions.

Only the audited control implementations opt in initially: `set`, `if`, `return`,
`try`, `forEach`, `throw`, `config.use` and `flow.wait`. Other Rhino implementations
use a shared compiled factory and a fresh instance per execution context. The
same rule applies to libraries loaded through `ctx.lib`: their exports remain
request-owned. Declaring a third-party implementation stateless is a correctness
contract, not an automatic inference by the engine.

## Internal invocation contract (`direct-v1`)

A called source can declare `_flow.invocation: "direct-v1"` after its blocks have
been audited for the lightweight context below. The server must also enable
`convertigo.javascript.stateless=true`. `convertigo.javascript.direct_calls=false`
disables direct children independently. Undeclared sources retain their requester.
This is an explicit compatibility contract, not a text-based inference about a
block implementation.

The Java API allocates an invocation view and a lexical frame on the current
thread. It creates no managed `Context`, worker, session or document. Identity is
the target project/sequence and a unique `flow-UUID` context name. The parent's
HTTP request and session are shared. Arbitrary context attributes (`get`, `set`,
`remove`) are local to the child. Authentication mutations use the shared session;
response header/status methods use the shared request attributes. The view exposes
project directory/URL helpers, authentication methods, `isRunning` and local
`abortRequestable`. Its `requestedObject` is metadata, not a running clone; custom
code must not treat it as execution state. Legacy XPath, connector, attachment,
context-manager, async and full `Context` APIs are outside this contract.

The common invocation policy preserves InternalRequester semantics: public-access
and TLS restrictions of external servlet requests are not imposed on internal
calls. Authentication is checked against the session and the prepared source
metadata. The cancellation/deadline owner is the outer requestable; an independently
shorter child timeout keeps its requester/worker. An authentication refusal delegates before the
child starts, preserving the requester's existing error envelope/disclosure policy
and one billing ticket. Parent cancellation fails closed and bills once; it must
never start a fallback worker. Business failures use the same provider error envelope as
ordinary native calls. Each executed child bills through the existing ticket
factory and queue, including failures. Billing failures do not replace the business
outcome. Runtime handles close in the execution service's `finally`; frames, MDC
and the thread classloader are restored on exit.

Typed canonical JSON objects pass through the invocation boundary by reference.
The caller and child must therefore treat shared data as shared. Scalar and
undeclared/text inputs retain the HTTP coercion rules, including integers beyond
2^53. Multi-valued native variables currently retain their requester. A template
may still copy values before the invocation boundary. Canonical results are returned
by reference; exotic results (getters, hooks, Java values, cycles, sparse arrays,
nonfinite numbers, negative zero) use the existing sanitization/detachment policy.
Handles and row-stream results must not cross this direct contract. Streaming
producers must retain the ordinary requestable path.

Additional fallbacks are exact requestable subclasses/legacy transactions,
different projects or project generations/providers, absent/inconsistent session,
reserved `__*` or `convertigo.*` input keys, custom controllers, registered engine
listeners or plugins, system/stub/async/XSLT/trusted/VIC parent modes, result cache,
billable output and statistics/trace consumers. A source that uses unsupported
full-context APIs must not declare `direct-v1`. Counters in the Java bridge expose
direct invocations and fallback reasons.

## Pool and remaining scope

Server `run` and metadata-only `syncInputs` select the same revision API, including
when the bridge supplies empty working-copy collections. The pool remains behind
the old/default path for Studio, authoring, older providers, real drafts and disabled
stateless execution. It has not been deleted for those consumers. Shared runtime
selection remains experimental and disabled by default; authoring/frontend
services are not qualified for concurrent use through a shared execution context.
