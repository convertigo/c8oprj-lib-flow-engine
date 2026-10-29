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

Only audited implementations opt in: the control blocks `set`, `if`, `return`,
`try`, `forEach`, `while`, `throw`, `config.use` and `flow.wait`, `requestable.call`,
and since 0.1.118 `http.request` (with its shortcuts), `crypto.hash`, `crypto.hmac`,
`crypto.random`, `crypto.equals` and `log`. Other Rhino implementations
use a shared compiled factory and a fresh instance per execution context. The
same rule applies to libraries loaded through `ctx.lib`: their exports remain
request-owned. Declaring a third-party implementation stateless is a correctness
contract, not an automatic inference by the engine.

## Java classes

The `Packages` of a call (and `java`, `javax`, `org`, `com`, `edu`, `net`) belong to
the generation of the class path of its project: a new object at each call, which
asks that class loader again for every name. `Packages.a.b.C` also asks for `a.b`
(and `a`) as classes. Code run for each call or each frame (a block function, the
module of a Rhino implementation that is not stateless) must not look classes up
through it:

- a class of the JDK or of the engine: `flowEngineClass("a.b.C")`, given by the
  engine to the scripts it evaluates (blocks, libraries, modules), resolves it once
  for the runtime with the class path of the engine, by its full name, and keeps it
  in a concurrent map (a Java map would give back the Java class of a Rhino class,
  hence a JavaScript holder). Resolve it in the module of the implementation. Without
  the engine (a test evaluating a block alone), `Packages["a.b.C"]` asks for the full
  name only;
- a class of a project (`com.convertigo.libflowengine.*`, compiled from `libs/src`
  into the class path of the projects): `flowProjectClass("a.b.C")`, null without
  it. A shared runtime keeps it in its registry by generation identifier
  (`__flowGenerationId`), wrapped for the shared scope, never for the scope of the
  call that asked first; the runtime ends with its generation. A runtime serving
  every project keeps no class of a project and asks again at each call, by the full
  name only.

`tests/shared-runtime-class-lookups.js` runs `Engine.run` in the `FlowRuntimeApi` of
the engine, a frame and the packages of a counting class loader per call, as the
bridge does: once warm, a call (sequential or concurrent) asks its generation for no
class, the six names bound by the engine apart; another generation asks once for its
own kernel.

## Plans prepared in advance (`preload` with `flows`)

Since 0.1.119, `preload` accepts `flows`, a list of `{flowQName, flowName, flowSource}`:
for each Flow it resolves the run plan with `resolveRunPlan`, from the fields of the
preload request with the source of the Flow, as the first run of the Flow resolves
it, hence under the same `plan:` key (project directory, qualified name, source) of
`FlowRuntimeApi.prepare`. The answer lists each Flow in `plans` (`ok`, `blockCount`,
`preparedNodes`, `durationMs`, or the `error` of a Flow that cannot be prepared, the
others being prepared), with `planCount` and `failedPlanCount`. Without `flows`,
`preload` prepares the catalog and the compiler as before.

The bridge sends it to the runtime the runs of the project use: the shared runtime
on a stateless server, the pool otherwise. The engine calls it in the background
(`FlowRuntimeWarmup`, engine property `javascript.runtime_warmup`) once the projects
of a starting server are loaded and when a project is loaded again, for each Flow of
the project and of the projects using it. Nothing runs: no input, no context, no
`run` of a block, no `ctx.lib` library; only what a first run prepares before running
(the catalog, the FlowScript blocks materialized, the `prepareNode` of the stateless
implementations, the modules they load). A run arriving meanwhile waits for the
preparation of its key instead of preparing it again.

## Authoring warm-up plans (`authoringWarmupPlan`)

What the web Studio asks first (trees, palettes) is prepared in the background by
the engine (`FlowAuthoringWarmup`, engine property `javascript.authoring_warmup`), but
the engine does not know what to prepare: it asks this provider a plan for a project
and a stage, `studio` (the Studio lists the projects, once after a start) or
`project` (the project is opened in the Studio, once per load). The request is the
one of the authoring calls of the project (`target: "engine"`, `engineSource`,
`projectDir`, working copies) with `stage` and `studioMode`. The answer:

```json
{ "ok": true, "format": "flow.authoring.warmup.v1", "stage": "studio",
  "items": [
    { "id": "tree", "method": "describeTree", "priority": 100, "request": { "includeBindings": false } },
    { "id": "frontend.runtime", "method": "authoringWarmupPlan", "priority": 10,
      "after": ["tree"], "request": { "stage": "project", "studioMode": false } },
    { "id": "palette:flow:Hello", "method": "authoringPalette", "flow": "Hello", "priority": 80,
      "request": { "surface": "virtual", "focusPath": "" } }
  ] }
```

Each item is a request of this provider: its `method`, its `request` options merged
over the request the Studio sends for that method (of the project, or of the Flow
named by `flow`), its `priority` (higher first, whatever the project; the works of a
project opened in the Studio come before the others), and `after`, the ids of the
items of the same plan it runs after (never before them, skipped when one of them
failed). The engine runs one item at a time, once the Studio is quiet; an item whose
response is on disk (`describeTree`, `authoringPalette`...) is not computed, the
others run each time. They are read-only: their calls never invalidate a cache.
The options must be those the Studio sends (`FlowVirtualProjector`,
`FlowStudioSupport`), or the Studio never asks the prepared response.

This provider plans the tree at the stage `studio` and, for a project with a
frontend builder, after the trees of every project, its plan of the stage `project`:
computing it describes the engine projection of its frontends, which starts the
frontbuilder companion and describes the documents of its sources, what the first
palette of a frontend node needs. At the stage `project`: the palette of each Flow,
then, for the first 24 layouts and pages of its frontends in the tree order, the two
requests the Studio sends for such a node (its engine projection, then its frontend
palette). Plans are not kept on disk. For an older provider, without this method,
the engine prepares the tree of each project only.

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

Server `run`, metadata-only `syncInputs` and `preload` with `flows` select the same revision API, including
when the bridge supplies empty working-copy collections. The pool remains behind
the old/default path for Studio, authoring, older providers, real drafts and disabled
stateless execution. It has not been deleted for those consumers. Shared runtime
selection remains experimental and disabled by default; authoring/frontend
services are not qualified for concurrent use through a shared execution context.
