# lib_flow_engine

Experimental Convertigo project used by the Flow POC.

The Java kernel resolves `lib_flow_engine.Engine` to:

```text
libs/flow/Engine.js
```

`Engine.js` exposes:

```text
run(requestJson)     -> responseJson
analyze(requestJson) -> analysisJson
context(requestJson) -> contextJson
catalog(requestJson) -> catalogJson
```

The Java side passes `flowSource` as an opaque string. This project owns parsing, catalog, analysis and execution.
For the POC, `Engine.js` is evaluated without the Rhino compiled-script cache so
runtime engine changes can be picked up after the Java bootstrap is restarted.

For source control, a Convertigo `Flow` should not serialize its full source as an escaped bean property. The Java POC writes the editable definition as valid YAML in the owning project:

```text
libs/flows/<FlowName>.flow.yaml
```

The bean property remains an in-memory editor bridge. On save/export the property is removed from Convertigo serialization and the sidecar file is written instead.

The runtime core is intentionally small. Concrete behavior is implemented by block modules in:

```text
libs/flow/blocks/*.js
```

Control flow is also implemented as blocks, for example `if` and `forEach`.

At runtime, the engine loads blocks from two places:

```text
lib_flow_engine/libs/flow/blocks/*.js      # core blocks
<current-project>/libs/flow/blocks/*.js   # project-local blocks
```

Project-local blocks are meant for application-specific vocabulary. They cannot
silently override core blocks; a name collision is reported as an error.

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
  `session.remove`;
- runtime tooling: `mcp.flow`.

In the FlowEngine virtual tree and Eclipse palette, blocks are grouped by
origin: core engine, current project, then external libraries. The runtime still
receives one flat block name, but the authoring UI should make it clear whether
a block comes from `lib_flow_engine`, the application project, or a future
library project.

The FlowEngine virtual tree also exposes `Catalog / Types`. Types are
first-class engine descriptors stored under `libs/flow/types`: docs,
validation/read/write hooks and web editor fragments belong there. Block
property descriptors reference this vocabulary with `kind`, and the catalog can
still keep usage counts as secondary information.

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
such as `out: flow.custom` then advertises `flow.custom.message` and
`flow.custom.source` as produced paths.

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
  "include": ["flow", "result"],
  "detail": "normal"
}
```

`node` can be a node `id`, `uid`, `name` or tree path such as
`nodes[3].nodes[0]`. `include` is optional; when absent, all visible scope roots
are returned. Keep `include` to root scope names only, for example `flow`,
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
    "flow": {
      "paths": [
        { "path": "flow.weather", "type": "unknown", "confidence": "inferred" }
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
    "flow": ["flow", "flow.weather", "flow.metropoles"]
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
paths such as `flow.weather.body.metropoles.city` to Studio pickers and LLM
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

Examples:

```yaml
- block: http.request
  method: GET
  url: "{{ config.weatherUrl }}"
  headers:
    X-Api-Key: "{{ config.apiKey }}"
  out: flow.weather

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
    unit: flow.unit
  out: flow.temperature
```

The chosen implementation is a named Flow sidecar. It receives the call input in
`request.input` and inherits the caller `config` scope, so provider URLs, API
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

## MCP Flow block

The runtime also dogfoods its own model through `mcp.flow`.

`mcp.flow` is a regular block that receives an MCP-style JSON-RPC request and
returns an MCP-style response. It currently exposes:

- `flow-catalog`;
- `flow-analyze`;
- `flow-context`;
- `flow-schema-reset`;
- `flow-run`;
- `flow-list`;
- `flow-get`;
- `flow-set`;
- `flow-test`;
- `flow-block-list`;
- `flow-block-get`;
- `flow-block-create`;
- `flow-block-test`.

This is not a replacement for the Convertigo MCP project yet. It is a small
runtime experiment proving that Flow introspection and execution can be exposed
from a block without adding Java admin services. `flow-run` returns only the
execution status and business result by default; internal `flow` and `trace`
data are opt-in to keep MCP responses compact.

`flow-block-create` writes project-local blocks under:

```text
<current-project>/libs/flow/blocks/<block-name>.js
```

This lets an agent add missing vocabulary to the current project without
modifying the shared core library.

`flow-set` writes project-local Flow sidecars under:

```text
<current-project>/libs/flows/<FlowName>.flow.yaml
```

It validates the YAML and runs `analyze()` before writing.

## Agent cycle

For an agent starting from a blank context, the intended development loop is:

```text
tools/list
flow-catalog
flow-list / flow-get
flow-block-list
flow-block-create only when the catalog is insufficient
flow-set
flow-test
```

The default path should remain catalog-first and sidecar-first. Custom blocks
are project vocabulary, not automatic core changes.
