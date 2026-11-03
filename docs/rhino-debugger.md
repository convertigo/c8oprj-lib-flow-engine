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

The original runner remains the ordinary path. A native implementation without a prepared runner can export `debug: {resolve,run}` beside `run`. These are shared **functions**, never shared argument values. Typed FlowScript graph blocks already use their existing property resolver and consume its captured result.

Current explicit core contracts cover `set`, `if`, `return`, `json.put`, `json.stringify`, `try`, `object.get`, `text.match`, `while`, `forEach`, `flow.call` and `throw`. While consumes its first captured condition once, then evaluates the condition at each subsequent iteration. Its clock begins at execution, while the enclosing request's timeout also applies during pauses. Other native implementations remain debuggable at boundaries, but their arguments are explicitly labeled **Arguments (source)** until they provide this contract. Do not advertise those source expressions as resolved values.

## Level 2: Rhino sources, Studio only

A breakpoint in a JavaScript source opts a Studio request into private interpreted compilation with debugging information. A block-only breakpoint does not enable it. Only this level permits stepping from a logical block into Rhino lines. It is unavailable on a production server.

Implementation source URLs use `project/relative/path.js`. Blanking the static `_meta` header preserves line numbers. Private lazy adapters and prepared state never enter shared compiled caches or the disk bytecode cache. Referenced libraries (including stateless ones), modules and their dependencies are evaluated privately for this request when that environment is selected; shared frozen instances and retained library state are not modified. This environment starts with fresh library state and is visibly identified by the debugger panel.

The current level-2 prototype still creates a complete private environment once Rhino is requested. Narrowing it to only the necessary lazy adapters is a separate improvement. Initialization and shared construction are never line-debuggable. Stop, detach, maximum pause and request timeouts retain the #1261 lifetime rules.

Validation uses `tools/run-tests.sh`, Java participant/boundary/timeout tests, and live Docker/Playwright recipes retained in the mission artifacts. This document describes the integration prototype, not a production inspection service or native Eclipse qualification.
