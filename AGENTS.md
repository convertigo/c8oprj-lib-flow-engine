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

Use `flow.call` when a Flow should call another Flow in the best-case path. It
stays inside Rhino, reads the named sidecar from `libs/flows`, passes a JSON
`input` object, and returns the child Flow `result` directly. Reserve
`sequence.call` for legacy requestables or SDK/API compatibility checks because
it goes through Convertigo's internal requester and returns the historical
XML-to-JSON `document.*` shape.

When creating a reusable Flow, define a minimal static contract with top-level
`input` and `output` sections. `flow.call` analysis flattens the child `output`
shape under its `out` path, so downstream nodes, pickers and agents can see
paths such as `flow.customer.name` without executing the child Flow.

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

## Analysis Contract

Keep analysis in the JS runtime. Java passes `flowSource` as opaque text.

`Engine.analyze()` should stay small but useful for agents and pickers:

- report scope paths;
- report global reads and writes;
- report node-level reads and writes;
- report child groups such as `nodes`, `then` and `else`;
- return structured static errors when possible.

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
