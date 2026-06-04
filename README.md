# lib_flow_engine

Experimental Convertigo project used by the Flow POC.

The Java kernel resolves `lib_flow_engine.Engine` to:

```text
libs/flow/Engine.js
```

`Engine.js` exposes:

```text
run(requestJson)           -> responseJson
analyze(requestJson)       -> analysisJson
context(requestJson)       -> contextJson
catalog(requestJson)       -> catalogJson
search(requestJson)        -> rg-like Flow search results
describeTree(requestJson)  -> virtual tree JSON
applyMutation(requestJson) -> mutated YAML source + tree
outputSchema(requestJson)  -> JSON schema
types(requestJson)         -> property type descriptors
```

The Java side passes `flowSource` as an opaque string. This project owns parsing, catalog, analysis and execution.
For the POC, `Engine.js` is evaluated without the Rhino compiled-script cache so
runtime engine changes can be picked up after the Java bootstrap is restarted.

For source control, a Convertigo `Flow` should not serialize its full source as an escaped bean property. The Java POC writes the editable definition as valid YAML in the owning project:

```text
libs/flows/<FlowName>.flow.yaml
```

The bean property remains an in-memory editor bridge. On save/export the property is removed from Convertigo serialization and the sidecar file is written instead.

The runtime core is intentionally small. Concrete behavior is implemented by
block descriptors in:

```text
libs/flow/blocks/*.block.yaml
libs/flow/blocks/*.js
```

Control flow is also implemented as blocks, for example `if` and `forEach`.
The `flow.call` block calls another Flow sidecar inside the Flow engine. This is
the preferred low-overhead composition path when a project wants subflows
without going through Convertigo requestable/XML execution.

`*.block.yaml` is the canonical block source format. It defines the visible
contract: typed props, icons, documentation, slots, declared `uses` and implementation runtime. A
flow-backed block stores its implementation as graph nodes:

```yaml
version: 1
props:
  input:
    kind: value
uses: []
implementation:
  runtime: flow
  file: decorate.flow.yaml
```

The block id is derived from the descriptor path, for example
`libs/flow/blocks/demo/decorate.block.yaml` becomes `demo.decorate`.

A Rhino-backed block keeps the same YAML descriptor and points to a peer
implementation file:

```yaml
version: 1
name: demo.native
implementation:
  runtime: rhino
  file: demo.native.js
```

The engine only discovers blocks through `<blockName>.block.yaml`. A peer
`<blockName>.js` is an implementation file, not a block definition. This keeps
metadata, docs and future implementation kinds (`java`, `kotlin`, etc.) in one
stable shape while preserving a small Rhino escape hatch.

Flow-backed blocks are regular catalog blocks. At runtime the engine exposes
evaluated instance properties through `input` and a private mutable `local`
scope for the block implementation. JS hooks/raw implementations can still call
`ctx.props(node)` to inspect the raw instance, but `props.*` is not an expression
scope. An internal `return` stops only the
composite block, then the parent Flow continues normally.

The `fragment.use` block expands a reusable graph inline from:

```text
<current-project>/libs/flow/fragments/<FragmentName>.fragment.yaml
```

A fragment is not a requestable and does not create a new scope. It behaves like
the fragment nodes were written at that exact position, so it can read and write
`input`, `config`, `local`, `result` and `current` directly. The Flow tree and
analysis expand fragment children logically while the disk representation keeps
the fragment as a separate source file.

At runtime, the engine loads blocks and optional shared helper libraries from
two places:

```text
lib_flow_engine/libs/flow/blocks/*.block.yaml # core block descriptors
lib_flow_engine/libs/flow/blocks/*.js      # legacy/native core blocks or descriptor implementations
<current-project>/libs/flow/blocks/*.block.yaml # project-local block descriptors
<current-project>/libs/flow/blocks/*.js   # legacy/native project blocks or descriptor implementations
<current-project>/libs/flow/fragments/*.fragment.yaml # project-local fragments
lib_flow_engine/libs/flow/lib/*.js         # core helper libraries
<current-project>/libs/flow/lib/*.js      # project-local helper libraries
<current-project>/libs/flow/resources/**/* # editable docs/data resources
```

Project-local blocks are meant for application-specific vocabulary. They cannot
silently override core blocks; a name collision is reported as an error.
Blocks can call `ctx.lib("name")` to load `libs/flow/lib/name.js` once per Flow
execution context. Blocks should declare that dependency with `uses: [name]` so
the library is visible in the catalog/treeview and patchable through MCP. When a reusable behavior has a clear input/output contract,
prefer a block over a helper library: blocks can be used in Flow graphs and can
also be called from JavaScript implementations with `ctx.callBlock(name, props)`.

## Project FlowEngine

The POC now has one project-level `FlowEngine` DatabaseObject, similar in
spirit to `MobileApplication` or `UrlMapper`.

It is the project anchor for:

- the selected runtime engine;
- project-local blocks, additive with the runtime/core catalog;
- global contract bindings;
- configuration scopes;
- shared fragments.

The Java object stays intentionally small. Its editable YAML body is stored in:

```text
<current-project>/libs/flow/engine.yaml
```

Example:

```yaml
version: 1
engineQName: lib_flow_engine.Engine
bindings:
  weather.currentTemperature@1: WeatherTemperatureOpenMeteo
config:
  openMeteo:
    baseUrl: https://api.open-meteo.com/v1/forecast
```

`Flow` remains the requestable/executable object. It always uses the selected
engine from the project `FlowEngine`. It can override bindings, config values
and fragments locally when needed, but the common project defaults belong to the
project `FlowEngine`.

The current catalog includes low-level composable blocks for:

- HTTP: `http.get`, `http.request`;
- JSON/object data: `json.select`, `json.push`, `json.parse`, `json.stringify`,
  `object.pick`, `object.merge`;
- lists: `list.filter`, `list.map`, `list.sort`;
- control flow: `if`, `forEach`, `use`, `return`, `throw`;
- output and text: `set`, `email.mock`;
- Convertigo runtime: `log`, `requestable.call`, `session.get`, `session.set`,
  `session.remove`.

`lib_flow_engine` should stay the standard runtime vocabulary. A block belongs
there only when it is generally useful in normal application Flows. Tooling
blocks, MCP server plumbing, benchmark helpers or migration helpers belong in a
separate library project such as `lib_flow_mcp`. The Flow MCP block lives there,
not in the standard catalog.

In the FlowEngine virtual tree and Eclipse palette, blocks are grouped by
origin: core engine, current project, then external libraries. The runtime still
receives one flat block name, but the authoring UI should make it clear whether
a block comes from `lib_flow_engine`, the application project, or a future
library project.

Block names use a light namespace convention. Short names such as `set`,
`return` and `forEach` are reserved for core primitives. Domain and integration
blocks should use dotted names such as `json.select`, `requestable.call`,
`email.send` or `flow.node.add`. Catalog metadata may also expose `package`,
`namespace` and `private`.

A private block is visible inside the project that defines it, but must not be
advertised to projects that reference that project as a library. This gives
authors and agents a safe place for local implementation details, generated
helpers and one-off glue without polluting the public palette.
Catalog APIs hide private blocks by default; diagnostic callers can pass
`includePrivate: true` when they intentionally inspect implementation details.

Direct Rhino code inside a Flow should remain an escape hatch, not the normal
model. The preferred equivalent of a small function is a project-local custom
block, often `private: true`, with a tiny catalog descriptor and optional
`analyze()` method. A generic script block would be useful only for debugging or
advanced migration cases because it hides intent, weakens schemas and encourages
SequenceJS-style low-code bypasses.

Custom block metadata should live in `*.block.yaml`. Rhino ES6 JavaScript is
only the implementation runtime when a block needs JVM/Java integration or
algorithmic code. It may use Java classes through `Packages`, for example for
integration adapters, but it must not assume Node.js APIs such as `require`,
npm modules or browser globals. A descriptor-backed Rhino implementation is an
IIFE returning `run`, and optionally `displayName` / `analyze`; `ctx.props(node)`,
`ctx.template(value)`, `ctx.expr(value)`, `ctx.read(path)`,
`ctx.write(path,value)` and `ctx.callBlock(name, props)` are the small runtime
API. Metadata, properties and docs must stay in the peer `*.block.yaml`
descriptor; Rhino implementations defining `catalog()` are rejected.

The FlowEngine virtual tree also exposes `Catalog / Types`. Types are
first-class engine descriptors stored as `libs/flow/types/*.type.yaml`: docs,
validation/read/write hooks and web editor fragments belong there. Block
property descriptors reference this vocabulary with `kind`, and the catalog can
still keep usage counts as secondary information.

## FlowScript spike

The `spike-flowscript` branch adds an experimental code-like authoring view for
LLMs. It does not replace Flow YAML yet. The engine renders existing Flow YAML
as FlowScript, accepts a revision-checked patch or full replacement, parses it
back into a Flow definition, validates block names/properties, and writes the
normal sidecar only when diagnostics are clean.

For new Flows, prefer the natural code-like form:

```javascript
flow GetFeedSorted({ input, config }) {
  const feed = requestable.call("RSSConnector.GetFeed");
  const sortedItems = list.sort(feed.rss.channel.item, {
    by: current.title,
    direction: "asc"
  });
  const news = list.map(sortedItems, {
    title: current.title,
    description: current.description,
    imageUrl: current.enclosure.attr.url
  });
  return {
    news,
    count: news.length
  };
}
```

This is syntax sugar, not free-form JavaScript. `const name = block(...)`
becomes `out: local.name`, paths like `feed.rss.channel.item` become
`local.feed.rss.channel.item`, object-style `list.map` expands to
`forEach/json.object/json.push`, and `return { key: value }` writes
`result.key`. The lower-level canonical call form remains valid for precise
edits:

```javascript
list.sort({ id: "sort", items: "local.feed.rss.channel.item", by: "current.title", out: "local.sorted" })
```

Core blocks:

- `flow.source.get`
- `flow.source.validate`
- `flow.source.patch`

This is meant to compare `Flow MCP blocks` versus `FlowScript via MCP` on the
same benchmark, not to freeze a final DSL.

Type editors are standard web components loaded from `libs/flow/types/editors`.
For a property `kind: "path"`, the host looks for `flow-path-editor`; for
`kind: "requestable"`, it looks for `flow-requestable-editor`, and so on. The
Java side only provides the JxBrowser host and a small bridge.

An editor component should implement:

```javascript
element.setState(state)
element.value
element.dispatchEvent(new CustomEvent("flow-value", { detail: { value } }))
```

The host also assigns `element.flowHost`, with:

```javascript
flowHost.request("context", {})
flowHost.request("requestables", {})
flowHost.setValue(value)
```

This keeps editor behavior hot-reloadable from the Flow engine project instead
of baking each property type into Eclipse Java code.

## Standard block selection

Core blocks should stay small, generic and predictable. The default move is to
add JSON/scope/list/control blocks that compose well, then promote project-local
blocks only when the vocabulary is clearly reusable.

Good first-class candidates from legacy Steps:

- `LogStep` -> `log`;
- `SequenceStep` / `TransactionStep` -> `requestable.call` for the KISS path;
- `GetRequestHeaderStep`, `SetResponseHeaderStep`, `SetResponseStatusStep` ->
  request/response blocks, once the request and response scopes are finalized;
- `SessionGetStep`, `SessionSetStep`, `SessionRemoveStep` -> `session.get`,
  `session.set`, `session.remove`;
- `SmtpStep` -> not as a direct clone, but as an `email.send` contract backed by
  SMTP config scopes;
- JSON file helpers (`ReadJSONStep`, `WriteJSONStep`) can become file blocks
  later, but need a clear project sandbox first.

Poor candidates for the initial core:

- XML/XPath/XSD-heavy Steps, because they would bring the legacy data model into
  a JSON-first engine before the bridge is designed;
- process and filesystem mutation blocks (`ProcessExecStep`, `DeleteStep`,
  `MoveFileStep`, etc.) before security and deployment boundaries are defined;
- authentication and context-removal Steps before runtime ownership is clear.

Block descriptors expose one display icon through `icon`. Use `mdi:*` or another
Iconify id for shared/core icons, a file path relative to the block file for
custom project/library icons, or an HTTPS URL when the icon must be cached from a
remote source. The Flow engine resolves the authoring value to concrete local
files when they exist in the provider project's cache.

Generated icon caches are intentionally ignored by Git:

```text
libs/flow/icons/iconify/<provider>/<name>.svg
libs/flow/icons/iconify/<provider>/<name>_16x16.png
libs/flow/icons/iconify/<provider>/<name>_32x32.png
libs/flow/icons/url/<sha256>.<ext>
```

For example, `mdi:power` resolves to
`libs/flow/icons/iconify/mdi/power_16x16.png` when the cache has been
populated. Run `tools/generate-mdi-icon-cache.js` to populate the local cache
from an Iconify MDI `icons.json` pack. The tool reuses Convertigo's
`convertigo-svg-icons` Batik converter, so generated PNGs follow the same path
as NGX dynamic component icons.

If no `return` block is executed, the Flow returns the `result` scope
implicitly. Use `return` only to stop early or return something other than
`result`. Use `throw` inside error branches to stop with a structured error.

## Runtime handles

Most Flow data should remain JSON-serializable, but some low-level blocks need
to keep live runtime objects between nodes: Java DBO instances, file writers,
OpenDocument handles, XLS workbooks, JDBC connections or transactions. Model
those values as typed handles such as `handle<dbo>`, `handle<file.writer>`,
`handle<xls.workbook>` or `handle<jdbc.transaction>`.

Handles may live in execution scopes such as `local`, `current` and
`request`. They must not be returned in `result`, persisted in Flow YAML, learned
as JSON schemas, or sent through MCP/SDK responses. When a trace or picker needs
to show a handle, show a small serializable summary: handle type, label, state
and optional QName/path. Never serialize the Java object itself.

Prefer scoped `with*` blocks for resources that must be closed, mirroring Java
`try-with-resources`:

```yaml
- block: file.withWriter
  path: local.outputPath
  as: local.writer
  nodes:
    - block: forEach
      items: local.lines
      nodes:
        - block: file.write
          writer: local.writer
          value: "{{ current }}"
```

The `with*` block opens the handle, writes it to the requested scope path, runs
child nodes, then closes the handle in a `finally`-style cleanup. Explicit
`open` / `close` blocks may exist for advanced cases, but standard libraries
should prefer the scoped form so authors and agents do not need to manage
cleanup manually.

The same pattern works for readers and other Java-backed resources. For
example, `file.withReader` exposes a `handle<file.reader>` and `file.forEachLine`
iterates over it while setting `current` to the current line:

```yaml
- block: file.withReader
  path: local.inputPath
  as: local.reader
  nodes:
    - block: file.forEachLine
      reader: local.reader
      nodes:
        - block: json.push
          path: result.lines
          value: "{{ current }}"
```

Use `requestable.call` when the target must go through the regular Convertigo
requestable path, like the SDK does. It accepts a sequence, Flow or transaction
target and unwraps the historical XML-to-JSON `document` wrapper so Flow authors
work with direct JSON data.

For `requestable.call` to be useful to pickers and agents, target Flows should
expose a small static contract:

```yaml
input:
  name: string
output:
  message: string
  source: string
nodes:
  ...
```

`flow-analyze` uses this `output` shape without running the child Flow. A node
such as `out: local.custom` then advertises `local.custom.message` and
`local.custom.source` as produced paths.

## Search API

`Engine.search()` is the compact discovery API for agents. It searches Flow
sidecars, nodes, catalog blocks/types and learned schemas, then returns
references that can be passed to other tools.
Multi-word queries match unordered tokens, so `GetFeed requestable call` can
find a `requestable.call` node targeting `AAAProject.GetFeed`.

Node matches return:

```text
flowQName + nodeId + JSON Pointer path
```

Use `nodeId` for semantic edit tools and the `/nodes/...` path for low-level
mutations. `context` behaves like `rg -C`: it adds nearby parent, previous,
children and next summaries without returning the whole Flow.

`Engine.applyMutation()` accepts both low-level JSON Pointer paths and semantic
node targets:

```json
{ "op": "replace", "nodeId": "setMessage", "property": "value", "value": "Done" }
```

Use `beforeNodeId`, `afterNodeId`, or `parentNodeId + slot` for insertions when
the target is clear; an agent should not depend on array indexes. JSON Pointer
paths remain the escape hatch for exact structural edits.

For broader edits, callers can also avoid YAML rewriting: `flow-get` returns the
parsed Flow `definition`, and `flow-set`, `flow-run`, `flow-test`, `flow-tree`,
`flow-apply` and `flow-output-schema` accept that same definition object. This
keeps the MCP surface small while preserving the legacy “read a tree, patch it,
write the same shape” authoring pattern.

## Block Authoring API

Blocks can be listed/read from core, shared libraries and the project. Creation
and editing are project-local. New blocks are canonical by default:
`blockCreate({ name, descriptorSource|descriptor, implementationSource })`
writes `<name>.block.yaml` plus either `<name>.flow.yaml` or `<name>.js`
depending on the descriptor runtime.

- `blockGet({ name })` reads any visible block as one logical unit. Canonical
  blocks return `descriptorSource`, `descriptor`, `implementationRuntime` and,
  for Rhino-backed blocks, `implementationSource`.
- `blockCreate({ name, descriptorSource|descriptor|definition, implementationSource })`
  creates a project-local canonical block. Use `implementation.runtime: "flow"`
  plus a Flow YAML implementation source, or `implementation.runtime: "rhino"`
  plus Rhino ES6 source.
- `blockDuplicate({ fromName, toName })` copies a visible block into the
  project using the canonical format.
- `blockEdit({ name, descriptorSource|descriptor|definition, implementationSource })`
  edits the descriptor and/or the implementation of a project-local block.

Core/shared blocks are intentionally not editable in place.

## Resource Patch API

For code-like maintenance, the engine also exposes project-local text resource
APIs:

- `resourceSearch({ query })` searches whitelisted resources, like a small
  `rg`.
- `resourceGet({ path })` reads content and returns a `hash`.
- `resourcePatch({ path, baseHash, patch })` applies a unified diff, then
  validates block/library JavaScript, Flow block/type descriptors and parses
  Flow/fragment YAML by default.
  Hunk line numbers may be approximate when the surrounding context is unique.

The writable surface is intentionally narrow:

```text
libs/flow/blocks/**/*.js
libs/flow/blocks/**/*.block.yaml
libs/flow/blocks/**/*.flow.yaml
libs/flow/fragments/**/*.fragment.yaml
libs/flow/lib/**/*.js
libs/flow/resources/**/*.{md,txt,json,yaml,yml}
libs/flow/types/**/*.type.yaml
libs/flow/types/**/*.js
libs/flow/types/editors/**/*.{html,css,js}
```

Flow graph changes should still use `flow-edit`/`flow-set` mutations. Resource
patching is for block implementations, composite blocks, helper libraries,
custom property editors and project-local documentation/data resources.

## Context picker API

`Engine.context()` returns the scope paths visible at a specific point in a
Flow. It is meant to feed Studio pickers and compact MCP/LLM guidance from the
same runtime analysis.

Request shape:

```json
{
  "flowSource": "version: 1\nnodes:\n...",
  "node": "notify",
  "property": "body",
  "include": ["local", "result"],
  "detail": "normal"
}
```

`node` can be a node `id`, `uid`, `name` or tree path such as
`nodes[3].nodes[0]`. `include` is optional; when absent, all visible scope roots
are returned. Keep `include` to root scope names only, for example `local`,
`current`, `input` or `config`. `detail` is `normal` by default; use `compact`
when an LLM only needs the paths.

Normal response:

```json
{
  "ok": true,
  "target": {
    "id": "notify",
    "block": "email.mock",
    "property": "body",
    "propertyDefinition": { "kind": "template", "type": "string" }
  },
  "scopes": {
    "local": {
      "paths": [
        { "path": "local.weather", "type": "unknown", "confidence": "inferred" }
      ]
    }
  }
}
```

Compact response:

```json
{
  "ok": true,
  "scopes": {
    "local": ["local", "local.weather", "local.metropoles"]
  }
}
```

The analysis is positional. For the default `position: "before"`, paths written
after the target node are not returned. Inside a `forEach`, the `current` scope
keeps a producer reference to the iterated source path.

## Learned schemas

Flows learn their final `result` structure on the first successful named run
when no declared `output` contract and no schema file exist yet. `http.request`
and `http.get` also learn their node output structure on the first successful
run when no node schema file exists yet. Stored files contain only types and
object keys, never response values:

```text
libs/flow/schemas/<flowName>/result.out.schema.json
libs/flow/schemas/<flowName>/<nodeId>.out.schema.json
```

If a file exists, it is reused and never overwritten by runtime execution.
To relearn, delete it through the `schemaReset()` API or the MCP
`flow-schema-reset` tool; the next successful run will create it again.

Flow output schema resolution is static-first. `Engine.outputSchema()` starts by
analyzing the Flow graph, propagates known block output schemas through values,
merges `result.*` writes, and honors explicit `return` blocks when their value
schema is known. Learned result schemas are only a fallback when static analysis
does not know enough.

`Engine.context()` and `Engine.analyze()` read these files and expose deeper
paths such as `local.weather.body.metropoles.city` to Studio pickers and LLM
guidance. When a `forEach` iterates over an array with a known schema, the
picker context exposes the iterated item under `current.*`; for example
`current.city` and `current.temperature`.

Call blocks also expose known output shapes during analysis when their target is
static. `requestable.call` reads Flow output contracts directly. For legacy
sequences and transactions, it asks Convertigo's `schemaManager`, converts the
generated DOM sample to JSON, then infers a Flow schema and unwraps the
historical `document` container.

## Property kinds

Block descriptors must say how each property is interpreted. A string is not
automatically a scope path or a template anymore.

Current kinds:

```text
text        literal string
template    string or object with {{ expression }} slots
expression  pure JS-like value expression
path        scope path to read or write
literal     raw JSON value, no resolution
schema      data shape metadata
```

The property `type` may be a runtime handle type, for example
`handle<file.writer>`. A consumer block should only accept compatible handles,
and a producer block should expose handle outputs through its `out` or `as`
property documentation.

Examples:

```yaml
- block: http.request
  method: GET
  url: "{{ config.weatherUrl }}"
  headers:
    X-Api-Key: "{{ config.apiKey }}"
  out: local.weather

- block: if
  condition: current.temperature >= config.threshold

- block: json.push
  path: result.hotCities
  value: "{{ current.city }}"

- block: set
  path: result.message
  value: Weather alert computed
```

Use `value` for literals and dynamic values. A string containing only
`{{ expression }}` returns the expression value with its native type; mixed text
uses the same syntax as a string template.

## Contracts and bindings

A Flow can call an intention instead of a technical implementation through
`use`.

The smallest contract shape is:

```yaml
contracts:
  weather.currentTemperature@1:
    description: Current temperature for one city.
    input:
      city: string
      latitude: number
      longitude: number
      unit: C|F
    output:
      city: string
      temperature: number
      unit: C|F
      provider: string
    defaultImplementation: WeatherTemperatureOpenMeteo
```

`defaultImplementation` keeps the contract executable even when the project has
not declared a binding yet. It can point to a real provider or to an explicit
mock. A contract without a default is allowed for design work, but the runtime
will fail with `NO_IMPLEMENTATION_FOR_CONTRACT` if no binding is provided.

Resolution order is intentionally small:

```text
node implementation
flow bindings
request config.bindings
project FlowEngine bindings
contract defaultImplementation
```

Example call site:

```yaml
- id: getTemperature
  block: use
  contract: weather.currentTemperature@1
  input:
    city: current.city
    latitude: current.latitude
    longitude: current.longitude
    unit: local.unit
  out: local.temperature
```

The chosen implementation is a named Flow sidecar. It receives the call input in
`input` and inherits the caller `config` scope, so provider URLs, API
keys and environment choices stay injectable.

`WeatherAlertContract` demonstrates this style: the main alert flow manipulates
`weather.currentTemperature@1`, while `WeatherTemperatureOpenMeteo` owns the
Open-Meteo request and response mapping.

`WeatherContractBinding` demonstrates a Flow-level binding override: the same
contract resolves to `WeatherTemperatureMock` without changing the `use` call
site.

`WeatherProjectBinding` demonstrates a project-level binding override coming
from `libs/flow/engine.yaml`.

## Current smoke scenario

The project contains a weather-alert fixture:

```text
fixtures/weather-alert.json
```

It is used to validate a realistic Flow shape:

- HTTP GET with headers;
- JSON selection;
- iteration over a list;
- comparison;
- conditional push into `result.hotCities`;
- templated email fields;
- mock email notification;
- direct returned JSON payload.

The smoke test also validates a compact variant using the richer catalog:

- generic `http.request`;
- `list.filter` on `current.temperature`;
- `list.sort` on `current.city`;
- `list.map` to produce the returned city names;
- implicit `result` return.

Run the standalone Rhino smoke test from the Convertigo source tree:

```sh
java -cp /Users/nicolas/git/convertigo/engine/build/libs/dependencies-8.5.0-beta.jar \
  org.mozilla.javascript.tools.shell.Main \
  -version 200 \
  /Users/nicolas/git/lib_flow_engine/tests/smoke.js \
  /Users/nicolas/git/lib_flow_engine/libs/flow
```

When the project is loaded in Convertigo, the inline runtime validation can be
called through the regular requestable URL:

```sh
curl -sS --get \
  --data-urlencode '__sequence=WeatherAlertInline' \
  'http://localhost:18080/convertigo/projects/AAAProject/.json'
```

Expected payload:

```json
{
  "hotCities": ["Paris", "Marseille"],
  "notification": {
    "sent": true,
    "to": "ops@example.com",
    "subject": "Weather alert",
    "body": "Hot cities over 35C: [\"Paris\",\"Marseille\"]"
  },
  "message": "Weather alert computed"
}
```

`WeatherAlert` is the same scenario using `config.weatherUrl`,
`config.apiKey` and `config.threshold`. The Flow engine detects those
`config.*` references and, when no explicit request config is provided, reads
matching values from the Rhino scope already populated by Convertigo sequence
variables. This keeps the Java bridge unaware of Flow variable semantics.

The `request` scope also exposes runtime metadata useful for portable examples:

```text
request.convertigoUrl
request.projectUrl
request.engineDir
request.engineProjectDir
request.projectDir
```

`WeatherAlertInline` reads the fixture through a local `file://` URL derived
from `request.engineProjectDir`. This keeps the deterministic smoke test
portable in Studio and Docker, where the external HTTP host/port may not be
reachable from inside the JVM.

`WeatherAlertOpenMeteo` is the same type of alert against the public
Open-Meteo forecast API. It calls `https://api.open-meteo.com/v1/forecast`
for a small hardcoded list of French cities, reads
`body.current.temperature_2m`, and returns the cities above the threshold.
It is useful for a real-network demo, while `WeatherAlertInline` remains the
deterministic no-network smoke test.

`lib_flow_engine` also carries its own requestable qualification Flows:

- `QualifCoreData` exercises the core JSON/object blocks;
- `QualifWeatherInline` exercises HTTP, JSON selection, list filtering, sorting
  and mapping against the local fixture.

## Analysis output

`Engine.analyze()` is intentionally owned by the JS runtime. Java does not parse
the Flow source.

The current analysis returns:

- all known scope paths;
- global `reads`;
- global `writes`;
- property-kind based reads and writes instead of guessing every string;
- one entry per node with `id`, `block`, `props`, `reads`, `writes` and child
  groups;
- learned JSON schemas, when available, attached to the scope path produced by
  the node;
- legacy requestable schemas for static `requestable.call` targets when a live
  Convertigo engine is available;
- a first `errors` array for future static diagnostics.

This is the first shape needed by a future Flow picker or MCP tool. Deep JSON
paths are exposed when a node has a declared or learned schema.

## Flow MCP library

The MCP-facing experiment lives in `lib_flow_mcp`. It uses the same runtime
APIs, catalog and context analysis as a normal Flow project, but keeps protocol
plumbing out of the standard engine vocabulary.

The agent authoring cycle is documented by `lib_flow_mcp`, which owns the MCP
tool names and protocol surface.
