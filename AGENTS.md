# lib_flow_engine Agent Guide

This project is the experimental Flow runtime used by Convertigo `Flow` objects.

## Runtime Contract

Convertigo Java resolves:

```text
lib_flow_engine.Engine -> libs/flow/Engine.js
```

`Engine.js` returns a JavaScript object exposing:

```text
run(requestJson)     -> responseJson
analyze(requestJson) -> analysisJson
context(requestJson) -> contextJson
catalog(requestJson) -> catalogJson
```

`flowSource` is opaque to Java. Parsing, catalog loading, analysis and execution are owned by this project.

## Flow Source Files

The preferred project representation is a valid YAML sidecar:

```text
libs/flows/<FlowName>.flow.yaml
```

Do not optimize for editing escaped `flowSource` content inside Convertigo YAML. Treat the Java bean property as an in-memory bridge for Studio/editor services; the source file is the human/LLM-friendly representation.

## RhinoJS Profile

Write RhinoJS compatible with Convertigo's Rhino ES6 mode.

Allowed and tested:

- `let` / `const`
- arrow functions
- template strings
- destructuring
- array spread
- object shorthand
- computed properties
- object spread
- Java bridge through `Packages`

Avoid:

- Node APIs: `require`, `process`, `Buffer`, npm packages
- browser APIs: `window`, `document`, `fetch`
- `import` / `export`
- `async` / `await`
- `class`
- function-call spread such as `fn(...args)`

## Architecture

Keep `libs/flow/Engine.js` small. It should:

- parse the request and Flow source;
- load blocks from `libs/flow/blocks/*.js`;
- prepare scopes;
- execute nodes in order;
- delegate each node to its block;
- collect trace, analysis and structured errors.

Blocks implement behavior. Even control flow such as `if` and `forEach` is a block.
Runtime-facing tooling can also be a block: `mcp.flow` exposes a small
MCP-style JSON-RPC surface for Flow catalog, analysis and execution.

Use `requestable.call` for Convertigo requestables. It accepts a sequence, Flow
or transaction target, follows the same requestable path as the SDK, and unwraps
the historical XML-to-JSON `document` wrapper so Flow authors work with direct
JSON data.

When creating a reusable Flow, define a minimal static contract with top-level
`input` and `output` sections. Static `requestable.call` analysis should expose
the target output shape under its `out` path, so downstream nodes, pickers and
agents can see paths such as `flow.customer.name` without executing the target.

Use `use` when the Flow should depend on a contract instead of a provider
implementation. A contract should normally declare `defaultImplementation` so a
fresh project remains executable. Bindings may override that default at node,
Flow, or config level, but avoid adding a broader injection system during this
POC.

Returning `result` is implicit. Add a `return` block only when the Flow must stop
early or return another value. Use `throw` to stop with a structured error from
an error branch.

Blocks are loaded from the core engine first, then from the current project:

```text
lib_flow_engine/libs/flow/blocks/*.js
<current-project>/libs/flow/blocks/*.js
```

Do not silently override core blocks from a project. Use a project-specific
name, for example `weather.hotCities`, when adding custom vocabulary.

Project-wide Flow defaults are read from:

```text
<current-project>/libs/flow/engine.yaml
```

This file is the sidecar source of the project `FlowEngine` DatabaseObject
during the POC. Put project-level bindings and config defaults there. Keep
Flow-level overrides in the Flow sidecar when a specific Flow must deviate from
the project default.

Each block module is an IIFE returning:

```javascript
(function () {
	return {
		name: "set",
		icon: "mdi:variable",
		catalog: function () {},
		analyze: function (ctx, node) {},
		run: function (ctx, node) {}
	};
}())
```

Use a single `icon` field for display. Prefer `mdi:*` ids for shared/core
blocks. Use a relative file path such as `./icons/my-block.png` only for custom
icons that ship next to a project/library block. HTTPS URLs are accepted but
must be cached locally by the engine/tooling before Studio/Admin display. Icon
caches are provider-local and ignored by Git, using paths such as
`libs/flow/icons/iconify/mdi/<name>_16x16.png` plus SVG/32px variants. Generate
PNG variants with `tools/generate-mdi-icon-cache.js`; it uses Convertigo's
`convertigo-svg-icons` Batik converter, not ImageMagick.

Use explicit value helpers instead of duplicating engine logic:

```text
ctx.expr(value)       pure JS-like expression
ctx.template(value)   template string/object with {{ expression }} slots
ctx.literal(value)    raw JSON value
ctx.input(props)      standard value resolution with {{ expression }} support
ctx.read(path)        read scope path
ctx.write(path, val)  write scope path
ctx.runNodes(nodes)   execute child nodes
ctx.runFlowSource(src, config, options) run another Flow source
ctx.flowGet(name)     read a named project Flow sidecar
ctx.props(node)       merged node properties
```

For generic values, expose a single `value` property. A literal string is a
literal, mixed text can contain `{{ expression }}`, and a string containing only
`{{ expression }}` returns the expression value with its native type.

Block `catalog()` should declare property kinds:

```javascript
props: {
	path: { kind: "path", mode: "write" },
	value: { kind: "value", type: "unknown" },
	body: { kind: "template", type: "string" }
}
```

The engine exposes those property kinds under `Catalog / Types` in the
FlowEngine virtual tree. Keep this vocabulary small and clear. Type
definitions live in `libs/flow/types`, and docs, validators, readers, writers
and web editor fragments should hang from those types instead of one-off Java
property hacks.

Type editor fragments live in `libs/flow/types/editors`. The generic host maps
`kind: "path"` to `flow-path-editor`, `kind: "template"` to
`flow-template-editor`, etc. Each editor must implement `setState(state)`,
expose `value`, and emit `flow-value` with `{ value }`. The host assigns
`flowHost` for synchronous requests such as `context` and `requestables`.

## Analysis Contract

Keep analysis in the JS runtime. Java passes `flowSource` as opaque text.

`Engine.analyze()` should stay small but useful for agents and pickers:

- report scope paths;
- report global reads and writes;
- report node-level reads and writes;
- report child groups such as `nodes`, `then` and `else`;
- return structured static errors when possible.

`Engine.context()` is the picker-oriented API. Use it when an agent or Studio
needs to know which scope paths are visible at a specific node:

```json
{
  "flowSource": "...",
  "node": "notify",
  "property": "body",
  "include": ["flow", "result"],
  "detail": "compact"
}
```

Keep `include` to root scopes only: `request`, `input`, `config`, `flow`,
`result`, `trace`, `current`. Omit `include` to return all visible roots. Use
`detail: "compact"` for LLM guidance and `detail: "normal"` for Studio picker
metadata. The default position is before the target node, so values produced
later are not suggested.

Schema learning is implicit and file-based. A named Flow writes
`libs/flow/schemas/<flowName>/result.out.schema.json` for its final result when
there is no declared output contract. `http.request` and `http.get` write
`libs/flow/schemas/<flowName>/<nodeId>.out.schema.json` only when that file is
missing and the run succeeds. These files store structure, not data. Use
`flow-schema-reset` or `Engine.schemaReset()` to delete learned schemas before
running again. `forEach` maps a known array item schema to `current.*`, so use
`flow-context` inside loops when choosing iterator expressions.

Flow output schema is static-first: `Engine.outputSchema()` analyzes the graph,
propagates known schemas through block values, merges writes under `result.*`,
and uses explicit `return` schemas when known. Learned result files are a
fallback, not the primary mechanism.

Static `requestable.call` nodes should enrich picker context too. Flow targets
read the Flow output contract; legacy sequence and transaction targets use the
Convertigo `schemaManager` when a live engine is available. Dynamic or templated
targets should degrade to the plain `out` path instead of guessing.

Do not add Java admin services just to expose this during the POC. Prefer
standalone Rhino validation first, then block-level or MCP/Studio integration
later.

`mcp.flow` may create project-local blocks through `flow-block-create`. Keep
those blocks scoped to the current project unless the user explicitly asks to
promote a block to the shared core library.

When acting as a Flow authoring agent, use this order:

```text
tools/list
flow-catalog
flow-list / flow-get
flow-context when choosing paths or expressions
flow-schema-reset before rerunning an HTTP learn scenario when the output changed
flow-block-list
flow-block-create only when the catalog is insufficient
flow-set
flow-test
```

Prefer editing Flow sidecars over adding custom blocks. Prefer project-local
custom blocks over changing the shared core library.

## Validation

Use the standalone smoke test before touching Java integration:

```sh
java -cp /Users/nicolas/git/convertigo/engine/build/libs/dependencies-8.5.0-beta.jar \
  org.mozilla.javascript.tools.shell.Main \
  -version 200 \
  /Users/nicolas/git/lib_flow_engine/tests/smoke.js \
  /Users/nicolas/git/lib_flow_engine/libs/flow
```

Use `AAAProject.WeatherAlertInline` for deterministic runtime validation. It
loads its fixture from the local engine project directory through `file://`, so
it does not depend on external network routing or Docker host ports.

Use `AAAProject.WeatherAlert` to validate the final requestable variable path.
That Flow references:

```json
{
  "config.weatherUrl": "...",
  "config.apiKey": "...",
  "config.threshold": 35
}
```

The Java bridge does not need to build this config. The Flow engine detects
`config.*` references and reads matching variables from the Rhino scope already
populated by Convertigo.

Use `AAAProject.WeatherAlertContract` to validate contract-first execution. The
main Flow calls `weather.currentTemperature@1`; the default implementation is
`WeatherTemperatureOpenMeteo`, which maps Open-Meteo input/output details behind
the contract.
