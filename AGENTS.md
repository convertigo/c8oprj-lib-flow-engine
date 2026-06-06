# lib_flow_engine Agent Guide

This project is the experimental Flow runtime used by Convertigo `Flow` objects.

## Runtime Contract

Convertigo Java resolves:

```text
lib_flow_engine.Engine -> libs/flow/Engine.js
```

`Engine.js` returns a JavaScript object exposing:

```text
run(requestJson)           -> responseJson
analyze(requestJson)       -> analysisJson
context(requestJson)       -> contextJson
catalog(requestJson)       -> catalogJson
search(requestJson)        -> rg-like Flow search results
describeTree(requestJson)  -> virtual tree JSON
applyMutation(requestJson) -> mutated Flow model + tree
outputSchema(requestJson)  -> JSON schema
types(requestJson)         -> property type descriptors
```

`flowSource` is opaque to Java. Parsing, catalog loading, analysis and execution are owned by this project.

## Flow Source Files

On the `spike-flowscript` branch, the preferred project representation is a
FlowScript sidecar:

```text
libs/flows/<FlowName>.flow.js
```

Legacy `libs/flows/<FlowName>.flow.yaml` is only a fallback while migrating the
spike. If both files exist, `.flow.js` is canonical. Do not optimize for editing
escaped `flowSource` content inside Convertigo YAML. Treat the Java bean
property as an in-memory bridge for Studio/editor services; the source file is
the human/LLM-friendly representation.

## FlowScript Spike

The `spike-flowscript` branch experiments with a code-like MCP authoring layer.
Project Flows now load `.flow.js` first, compile it to the internal Flow
definition, validate it, and execute that model. YAML is still accepted as a
temporary fallback only when no `.flow.js` exists.

Current engine APIs:

```text
flowSourceGet(requestJson)      -> FlowScript code + revision
flowSourceValidate(requestJson) -> parsed definition + YAML + diagnostics
flowSourcePatch(requestJson)    -> revision-checked patch/replacement + write

flowCodeGet(requestJson)        -> compact {code, revision}
flowCodeSet(requestJson)        -> compact revision-checked validate/write
flowCodePatch(requestJson)      -> compact revision-checked patch/write
flowCodeRg(requestJson)         -> compact code extracts
```

Prefer `flowCode*` for agent-facing authoring. Keep `flowSource*` for compiler
debugging and model/YAML inspection.

Current block wrappers:

```text
flow.source.get
flow.source.validate
flow.source.patch
```

FlowScript accepts a natural code-like sugar for the common LLM path:

```javascript
function MyFlow({ input, config, result }) {
  const feed = requestable.call(".RSSConnector.GetFeed");
  const sorted = list.sort(feed.rss.channel.item, {
    by: current.title,
    direction: "asc"
  });
  const news = list.map(sorted, {
    title: current.title,
    description: current.description,
    imageUrl: current.enclosure.attr.url
  });
  result.news = news;
  result.count = news.length;
  return result;
}
```

The compiler lowers this to regular Flow nodes. `const name = block(...)`
writes to `local.name`, unqualified local variables are rewritten to `local.*`,
`list.map(items, { field: current.value })` becomes an explicit
`forEach/json.object/json.push` graph, and `result.key = value` writes the
response scope.

The canonical syntax remains available:

```javascript
function MyFlow({ input, config, result }) {
  requestable.call({ id: "getFeed", requestable: ".RSSConnector.GetFeed", out: "local.feed" })
  list.sort({ id: "sort", items: "local.feed.rss.channel.item", by: "current.title", out: "local.sorted" })
  forEach({ id: "each", items: "local.sorted" }) {
    json.object({ id: "item", out: "local.item" }) {
      json.field({ id: "title", key: "title", value: "{{ current.title }}" })
    }
    json.push({ id: "push", path: "result.news", value: "{{ local.item }}" })
  }
}
```

Do not broaden this into full JavaScript during the spike. Add syntax only when
it demonstrably reduces LLM retries on the benchmark. Do not add native JS
control flow, promises, `await`, array `.map()` or arbitrary object literals in
expressions unless they compile to deterministic Flow nodes.

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

- parse the request and FlowScript/legacy Flow source;
- load FlowScript blocks from `libs/flow/blocks/**/*.block.js`, then fallback
  descriptor-backed blocks from `libs/flow/blocks/**/*.block.yaml` and their
  runtime files;
- prepare scopes;
- execute nodes in order;
- delegate each node to its block;
- collect trace, analysis and structured errors.

Blocks implement behavior. Even control flow such as `if` and `forEach` is a block.
Runtime-facing tooling can also be built as blocks, but protocol plumbing belongs
in dedicated libraries rather than the standard catalog.

Use `requestable.call` for Convertigo requestables. It accepts a sequence, Flow
or transaction target, follows the same requestable path as the SDK, and unwraps
the historical XML-to-JSON `document` wrapper so Flow authors work with direct
JSON data.

When creating a reusable Flow, define a minimal static contract with top-level
`input` and `output` sections. Static `requestable.call` analysis should expose
the target output shape under its `out` path, so downstream nodes, pickers and
agents can see paths such as `local.customer.name` without executing the target.

Use `use` when the Flow should depend on a contract instead of a provider
implementation. A contract should normally declare `defaultImplementation` so a
fresh project remains executable. Bindings may override that default at node,
Flow, or config level, but avoid adding a broader injection system during this
POC.

Returning `result` is implicit. Add a `return` block only when the Flow must stop
early or return another value. Use `throw` to stop with a structured error from
an error branch.

Runtime handles are allowed for live objects that cannot be serialized, such as
DBO instances, file writers, OpenDocument objects, XLS workbooks and JDBC
transactions. Treat them as typed values like `handle<dbo>` or
`handle<jdbc.transaction>`. Handles may live in `local`, `current` and
`request`, but never in `result`, persisted Flow sources, learned schemas or
MCP/SDK responses. Traces and pickers must show only a serializable summary.

Prefer scoped `with*` blocks for handles that require cleanup, like Java
try-with-resources. A block such as `file.withWriter` should open the handle,
write it to an `as` path, run child nodes, then close it in a finally-style
cleanup. A block such as `file.withReader` should follow the same shape, with
iterator blocks like `file.forEachLine` consuming the handle and exposing
`current`. Only add explicit `open` / `close` blocks for advanced cases.

Blocks are loaded from the core engine first, then from the current project:

```text
lib_flow_engine/libs/flow/blocks/*.block.js
lib_flow_engine/libs/flow/blocks/*.block.yaml
lib_flow_engine/libs/flow/blocks/*.js
<current-project>/libs/flow/blocks/*.block.js
<current-project>/libs/flow/blocks/*.block.yaml
<current-project>/libs/flow/blocks/*.js
```

Prefer `*.block.js` for new project-local FlowScript blocks on this spike. It is
the canonical code-first block format:

```javascript
const _meta = {
  description: "Decorates a message.",
  properties: {
    message: { kind: "template", type: "string" }
  },
  outputs: {
    out: { type: "string" }
  }
}

function decorate({ input, config, result }) {
  const text = `*** ${input.message} ***`
  return text
}
```

The block id comes from the file path: `libs/flow/blocks/demo/decorate.block.js`
is `demo.decorate`. When both `.block.js` and `.block.yaml` exist for the same
block, `.block.js` is canonical.

Use `*.block.yaml` only for legacy/native-backed blocks, for example:

```yaml
implementation:
  runtime: rhino
  file: my.block.js
```

For Rhino/native escape hatches, the peer JS file is only the implementation
named by `implementation.file`; it is not a block definition. Metadata,
properties and docs must still be visible through the block contract exposed by
the engine.

Do not silently override core blocks from a project. Use a project-specific
name, for example `weather.hotCities`, when adding custom vocabulary.

Use a `runtime: flow` block when a reusable behavior is naturally expressed as
existing blocks. It keeps the item in the palette/catalog while making the
implementation visible as nodes. Use `input.*` for evaluated instance
properties and `local.*` for implementation-private state. `props.*` and
`flow.*` are not expression scopes; JS hooks/raw implementations can inspect the
raw node with `ctx.props(node)`. Use `runtime: rhino`
only when the behavior needs Rhino/Java code or would be awkward as a graph.

When a Rhino block calls `ctx.lib("name")`, declare the dependency in the
descriptor with `uses: [name]` so the library appears under `Catalog >
Libraries` and under the block's `Uses` node.

Keep the standard library small. Put only generally useful runtime blocks in
`lib_flow_engine`. MCP plumbing, Studio tooling, benchmark helpers and migration
helpers belong in a dedicated library such as `lib_flow_mcp`, not in the core
catalog.

Use dotted names for non-core vocabulary: `json.select`, `requestable.call`,
`flow.node.add`, `mcp.server`. Catalog metadata may expose `package`,
`namespace` and `private`.

Prefer a project-local custom block over inline Rhino code when behavior does
not fit existing blocks. Mark one-off or implementation-detail blocks
`private: true` so they are usable in the owning project but not advertised to
projects that reference it. A generic script-style block is an escape hatch for
debugging or migration only; it should not be the default authoring path because
it weakens schemas and recreates SequenceJS-style hidden logic.

Use `fragment.use` when the behavior is graph-shaped and should stay visible in
the tree. Fragments live in `libs/flow/fragments/<Name>.fragment.yaml`, execute
inline in the current scopes, and are expanded by analysis/tree/picker APIs.

Use `libs/flow/resources/**/*` for project-local documentation or data files
that should be searchable and patchable by agents without becoming executable
code. The `flow-resource-*` APIs accept `.md`, `.txt`, `.json`, `.yaml` and
`.yml` files under that directory.
Prefer fragments over `flow.call` for internal factoring when no requestable
boundary or new input/output contract is needed.

Project-wide Flow defaults are read from:

```text
<current-project>/libs/flow/engine.yaml
```

This file is the sidecar source of the project `FlowEngine` DatabaseObject
during the POC. Put project-level bindings and config defaults there. Keep
Flow-level overrides in the Flow sidecar when a specific Flow must deviate from
the project default.

Rhino implementation files are IIFEs returning runtime implementation only. They
must not define `catalog()`, `name`, `private`, `displayName()` or `analyze()`.
For new blocks, prefer FlowScript `*.block.js` where `_meta` carries static
metadata and the function carries behavior. For descriptor-backed Rhino/native
blocks, static metadata, properties and docs belong in `*.block.yaml`; optional
dynamic hooks belong in a peer file declared with `hooks.file`.

```javascript
(function () {
	return {
		run: function (ctx, node) {
			// ...
		}
	};
}())
```

```yaml
hooks:
  file: my.block.hooks.js
```

```javascript
(function () {
	return {
		displayName: function (node) {
			return "short tree label";
		},
		analyze: function (ctx, node) {
			ctx.addPath("local.value");
		}
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
ctx.callBlock(name, props, options) call another block as a capability
ctx.runFlowSource(src, config, options) run another Flow source
ctx.flowGet(name)     read a named project Flow sidecar
ctx.props(node)       merged node properties
```

For generic values, expose a single `value` property. A literal string is a
literal, mixed text can contain `{{ expression }}`, and a string containing only
`{{ expression }}` returns the expression value with its native type.

Block descriptors should declare property kinds:

```yaml
props:
  path:
    kind: path
    mode: write
  value:
    kind: value
    type: unknown
  body:
    kind: template
    type: string
```

The engine exposes those property kinds under `Catalog / Types` in the
FlowEngine virtual tree. Keep this vocabulary small and clear. Type descriptors
live in `libs/flow/types/*.type.yaml`, and docs, validators, readers, writers and
web editor fragments should hang from those types instead of one-off Java
property hacks.

The descriptor file is `libs/flow/types/<name>.type.yaml`. Optional JavaScript
files under `libs/flow/types` are implementation resources referenced by that
descriptor; they are not the type contract.

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
  "include": ["local", "result"],
  "detail": "compact"
}
```

Keep `include` to root scopes only: `request`, `input`, `config`, `local`,
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

Mutation helpers should prefer semantic node targeting when they have a
`nodeId`: `{op:"replace", nodeId:"setMessage", property:"value", value:"Done"}`.
Use `beforeNodeId`, `afterNodeId`, or `parentNodeId + slot` for inserts. Keep
JSON Pointer paths as the exact low-level fallback.

Block authoring must stay project-local. Search FlowScript blocks with
`blockCodeRg`, read any visible block with `blockGet` or `blockCodeGet`, create
FlowScript blocks with `blockCodeSet`, patch existing FlowScript block code with
`blockCodePatch`, duplicate core/shared blocks with `blockDuplicate`, and edit
only project-local copies. `blockCodeSet` writes `<name>.block.js` and removes
obsolete YAML fallbacks for that block. `blockCreate` remains the lower-level API
only for descriptor-backed Rhino/native compatibility cases.

Static `requestable.call` nodes should enrich picker context too. Flow targets
read the Flow output contract; legacy sequence and transaction targets use the
Convertigo `schemaManager` when a live engine is available. Dynamic or templated
targets should degrade to the plain `out` path instead of guessing.

Do not add Java admin services just to expose this during the POC. Prefer
standalone Rhino validation first, then block-level or MCP/Studio integration
later.

The Flow MCP library may create project-local blocks through `flow-block-create`.
Keep those blocks scoped to the current project unless the user explicitly asks
to promote a block to the shared core library.

When acting as a Flow authoring agent through `lib_flow_mcp`, use this order:

```text
tools/list
flow-code-rg / flow-search
flow-code-get for an existing Flow
flow-code-set dry:true for a new or edited FlowScript draft
flow-context when choosing paths or expressions
flow-schema-reset before rerunning an HTTP learn scenario when the output changed
flow-catalog only when search/examples/diagnostics are insufficient
flow-block-code-rg / flow-block-code-get for custom FlowScript blocks
flow-block-code-set dry:true then dry:false only when reusable vocabulary is needed
flow-block-code-patch for existing project-local FlowScript blocks
flow-code-run / flow-test
```

Prefer editing Flow sidecars over adding custom blocks. Prefer project-local
custom blocks over changing the shared core library. Do not hide a complete
backend feature in one Rhino block: compose IO, list/JSON transforms and result
mapping with FlowScript, and keep Rhino for the one missing primitive.

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
