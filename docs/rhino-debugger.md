# Block and Rhino debugging

The runtime has two independent debugging levels. Both reuse the #1261 session, transport and inspection limits. They never replace shared instances or mutate frozen exports.

## Level 1: compiled blocks

Ordinary runners check a live indicator at each block boundary. Without a debugger session they take their original compiled path; there is no participant callback or per-request debug plan. If the Java participant primitives are absent, bootstrap disables the feature and prepared runners contain no indicator check. This is supported on ordinary Convertigo develop servers.

A selected or later-attached request creates its participant only at a safe boundary, outside preparation, shared builders and locks. Sources identify the physical Flow, its revision and the logical node. Inputs, arguments, output, locals, result and `@` bindings belong to that activation. Opaque value references use the existing #1261 registry: 20 initial scope rows, 100 properties per page, bounded previews, no getters or host traversal, and expiration on resume. Lazy configuration is shown as an accessor rather than forced.

Step over skips descendants and return boundaries and stops before the next sibling. Step into enters a child, or stops after a leaf to show its output. Step out stops before the next caller block. Repeated activations carry a visit number. An error boundary retains its scopes before unwinding; propagation of the same error does not repeatedly pause the request.

### Resolving arguments once

A debug argument contract has two operations: `resolve(ctx,node)` returns the values that execution will consume; `run(ctx,node,args)` consumes those captured values without evaluating them again. The resolver must preserve laziness and evaluation order. It must not evaluate child bodies, acquire a shared builder across a pause, or eagerly read an unused fallback.

Prepared implementations can attach the contract while preparing a runner, before it is published:

```javascript
var runner = function(ctx) { return write(ctx, resolve(ctx)); };
return helpers.debug ? helpers.debug(runner,
  function(ctx) { return {value: resolve(ctx)}; },
  function(ctx, node, args) { return write(ctx, args.value); }) : runner;
```

The original runner remains the ordinary path. A native implementation without a prepared runner can export `debug: {resolve,run}` beside `run`. The contracts contain **functions**, never captured argument values; each resolution result belongs to its activation. Typed FlowScript graph blocks already use their existing property resolver and consume its captured result.

All 176 built-in Rhino implementations now declare an explicit contract (including prepared core runners), alongside typed FlowScript graph blocks. Collections, HTTP, files, crypto, library delegates, polling and authoring commands consume their activation-owned arguments. The original ordinary `run` functions are unchanged, except for `config.mutate` and `schema.adopt`: each now resolves `dryRun` once instead of twice when its first value is false. Custom Rhino implementations can opt into the same two-operation contract; without one they display **Arguments (source)**.

A value that depends on an item or child execution cannot be resolved before that execution. Such arguments explicitly show `{expression, deferred}` before consumption: `list.filter/map/sort` resolve once per item, `flow.poll.until` once after each attempt, `json.field.key` after its child value, and `debug.probe.label` after trace initialization. The argument record is updated with the last consumed value. No child body, network call, file write or shared construction is performed to populate the Arguments section. File paths are unopened descriptors; live handles stay opaque. Library delegates retain the ordinary receiver and method, including normal state and error translation.

Capture preserves evaluation order and laziness. For example, `number.choose` resolves only the chosen arm; `list.first`/`list.last` resolve their fallback only for an empty list; `session.get` reads its default only after a missing attribute; `json.safeParse` resolves the truncation flag only after a parse error. A child-produced value is captured when that child actually returns, rather than executing the child before the parent's breakpoint. While consumes its first captured condition once, then evaluates the condition at each subsequent iteration. Its clock begins at execution, while the enclosing request's timeout counts execution time only: debugger pauses suspend that same deadline, including waiting caller budgets. Each pause keeps its independent wall-clock bound (`javascript.debugger.pause_timeout`, default 120 seconds); expiry automatically resumes execution rather than cancelling it.

The ordinary runner has no new resolver call. Contract metadata is part of implementation preparation/instantiation, not the hot runner body; this does not by itself prove zero cold-start or allocation cost for instance factories. Keep that qualification separate from the detached boundary indicator benchmark.

## Level 2: Rhino sources, Studio only

A breakpoint in a JavaScript source opts a Studio request into private interpreted compilation with debugging information. A block-only breakpoint does not enable it. Only this level permits stepping from a logical block into Rhino lines. It is unavailable on a production server.

Implementation source URLs use `project/relative/path.js`. Blanking the static `_meta` header preserves line numbers. Private lazy adapters and prepared state never enter shared compiled caches or the disk bytecode cache. Referenced libraries (including stateless ones), modules and their dependencies are evaluated privately for this request when that environment is selected; shared frozen instances and retained library state are not modified. This environment starts with fresh library state and is visibly identified by the debugger panel.

The current level-2 prototype still creates a complete private environment once Rhino is requested. Narrowing it to only the necessary lazy adapters is a separate improvement. Initialization and shared construction are never line-debuggable. Stop, detach, maximum pause and request timeouts retain the #1261 lifetime rules.

Validation uses `tools/run-tests.sh`, Java participant/boundary/timeout tests, and live Docker/Playwright recipes retained in the mission artifacts. This document describes the integration prototype, not a production inspection service or native Eclipse qualification.

In the web Studio, selecting a logical stack frame reveals its block in the existing authoring tree. The marker matches the frame URL against the node debug target (source revision plus JSON Pointer); it is independent of tree selection and disappears on resume or detach. No second node registry is used. Native Eclipse tree integration remains separate.
