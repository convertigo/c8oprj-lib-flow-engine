# Efficient row processing and runtime profiling

Use the data provider's filters, column projection, ordering and pagination before
transferring rows. Use `list.filter` for a local predicate, and `list.map` for a
single expression. When formatting requires blocks, keep the blocks visible in a
`forEach` body; a custom Rhino loop is not needed.

```javascript
local.rows = list.filter({ items: input.rows, where: current.active === true })
json.array({ path: "result.rows", itemType: { type: "object" } })
forEach({ items: local.rows, $$nodes: function () {
  local.row = current
  local.formatted = { id: local.row.id }
  forEach({ items: input.columns, $$nodes: function () {
    local.column = current
    local.value = object.get({ source: local.row, key: local.column.name })
    json.put({ path: "local.formatted", key: local.column.name, value: local.value })
  } })
  json.push({ path: "result.rows", value: local.formatted })
} })
```

Capture `current` in a named local before entering another loop. Prepare metadata
once outside the loop. Append with `json.push` and update entries with `json.put`;
avoid copying the growing result array at every iteration. Limit rows and selected
columns at the public boundary. Declare array item schemas when accepting objects
over HTTP (`items: { type: "object" }`).

The engine prepares value expressions, destinations and block runners lazily and
reuses the prepared program. Values are evaluated against the current invocation;
user data, output values and invocation scopes are not shared between users.

## Measure without observing every value

Normal MCP `code-run` does not capture per-node trace snapshots. Request
`includeTrace: true` for a compact trace or `includeFullTrace: true` for full values.
Turn them off for throughput measurements. `profile: "envelope"` measures phases;
`profile: true` adds node/block records, including `allocatedBytes` when the JVM
supports thread allocation counters. Timings and allocations of nested records
are inclusive: do not add a parent block and its child nodes. Profiling itself
adds overhead. Compare unprofiled runs for release measurements.

The reproducible fixture is `tests/fixtures/runtime-rows/`: an ordinary Flow calls
a FlowScript formatter for each retained row/cell. No Baserow service is required.
`tools/benchmark-rows-runtime.js` accepts engine root, fixture project directory,
sample count, warmup count, shapes, and optionally a baseline engine root. The
optional baseline and candidate run in alternating order in one JVM, with an
exact result check after every call. Run through Rhino 200 with the Convertigo
dependencies classpath and the same initialization used by `tools/run-tests.sh`:

```sh
java -cp '<dependencies-jar>' org.mozilla.javascript.tools.shell.Main -version 200 \
  tools/benchmark-rows-runtime.js _flow tests/fixtures/runtime-rows 20 10 20x8,100x12
```

When using server webapp jars, initialize engine logging/properties as in the
standalone test setup. `MEASURE` lines contain wall time, thread CPU time and
`ThreadMXBean.getThreadAllocatedBytes` deltas, not retained heap size. Keep JVM,
heap, CPU, source commit, fixture and warmup policy constant. Profile separately.

## Schema work is demand driven

Catalogue, tree and code checks use an existing learned legacy requestable XSD;
they do not trigger a whole-project XML schema build to discover one requestable's
output. With no learned contract, its output remains unknown. Request
`flow-requestable-schema` explicitly to inspect/build it, or learn it with safe
sample inputs when execution is appropriate.

The native XSD bridge caches static Flow output contracts by source and dependency
fingerprints. The shared cache contains bounded serialized schemas, never scopes
or data. Source, blocks, types, configuration, fragments and learned contracts
participate in invalidation. Draft/override requests and analyses depending on
dynamic Flow contracts or custom analysis hooks use the ordinary uncached path.
Studio/MCP changes invalidate immediately. External filesystem changes require
the normal reload/cache invalidation; the metadata fallback rechecks after one
second. Unchanged contracts can survive promotion of another Flow in the project.

Compiled engine module code is shared through Convertigo's Rhino script cache;
each evaluation still creates independent exports and closures. Nothing caches a
result of a business block or a caller's credentials.

`tools/benchmark-json-xml.js` measures the existing Java JSON/XML round trip and
plain JSON serialization with identical row/cell payloads. It is a transport cost
measurement, not a direct-JSON requester implementation. XML/JSON requesters keep
their current contracts in this release.
