# Efficient row processing and runtime profiling

Process a whole table with one block execution; use the row primitives below
instead of a loop of Flow blocks per cell.

Use the data provider's filters, column projection, ordering and pagination before
transferring rows. Use `list.filter` for a local predicate and `list.map` for a
single expression. For typed cells, distinct rows, grouping and projection, use
the portable `rows.*` blocks. Properties and column paths are prepared once per
array, and the internal array loop creates no Flow node per row or cell. These
primitives contain no HTTP calls or application orchestration.

```javascript
local.rows = list.filter({ items: input.rows, where: current.active === true })
result.rows = rows.formatCells({
  rows: local.rows,
  columns: input.columns,
  keepColumns: ["id"],
  escapeHtml: true,
})
```

`columns` is an ordered array of descriptors, for example:

```json
[
  {"name":"label","type":"text"},
  {"name":"amount","type":"number","decimals":2},
  {"name":"enabled","type":"boolean","trueText":"Oui","falseText":"Non"},
  {"name":"due","type":"date","pattern":"dd/MM/yyyy"}
]
```

Each cell is `{value, text}`. `value` retains its JSON type; null/missing uses
`nullText` (empty by default). Optional `key` renames the column; optional `path`
reads nested JSON. `valuesOnly:true` returns raw selected values without cells.
`includeNumeric:true` adds a strict decimal-text flag. Numeric text is accepted
only when finite, booleans must be booleans, and ISO dates are strict (30 February
fails). Date patterns support `yyyy`, `M/MM/MMM/MMMM`, `d/dd`, `EEE/EEEE`, `H/HH`,
`m/mm`, `s/ss`, punctuation and `long`. Dates without offsets retain their civil
date/time; timestamps with offsets use the column's IANA `timeZone` (UTC default).
Set the same `locale` (fr-FR default) and zone on both runtimes.

## Whole-array contracts

| Block | Contract |
| --- | --- |
| `rows.formatCells` | `{rows, columns, keepColumns?, valuesOnly?, escapeHtml?, includeNumeric?}` → cell rows. |
| `rows.distinct` | `{rows, columns, valueKey?}` → first row of each unique tuple, preserving order. Empty columns keeps all rows. |
| `rows.group` | `{rows, groupColumns, aggregations, valueKey?, skipInvalid?}` → one row per group in first-occurrence order. |
| `rows.select` | `{rows, firstColumns?, columns?, columnsOrder?, rename?}` → projected, ordered, renamed row objects. |
| `rows.read` | `{rows, path, defaultValue?, skipMissing?}` → one path result per element, or per JSON text element. |

`rows.distinct` and `rows.group` default to raw values (`valueKey:""`). For
formatted cells, pass `valueKey:"value"`. Equality is type-sensitive and
structural: numeric 1 differs from text "1", object key order does not matter,
and missing equals null. Composite keys cannot collide through separators.

An aggregation is `{type:"sum",column:"amount",key:"total"}`; supported types
are `count`, `sum`, `avg`, `min`, `max`. Count counts rows. Sum/average accept
finite numbers or numeric text; min/max accept consistently typed numbers or
text (ISO dates sort chronologically). Null, missing and empty text are skipped;
invalid values fail unless `skipInvalid:true` is explicitly chosen. Empty input
returns `[]`; no group columns creates one global group for nonempty input.
Count/sum with no values give 0; avg/min/max give null. The output copies the
first row of each group and writes raw aggregate values at the chosen keys.
Format the aggregates afterwards if cells are wanted.

```javascript
local.totals = rows.group({
  rows: input.rows,
  groupColumns: ["status"],
  aggregations: [
    {type:"count", key:"count"},
    {type:"sum", column:"amount", key:"total"},
  ],
})
result.rows = rows.select({
  rows: local.totals,
  columns: ["status", "count", "total"],
  rename: {status:"label"},
})
```

Selection strings are literal keys, including dots; a string beginning with `$`
is an explicit JSON path. Use `{path:"$.customer.name", key:"name"}` for a nested
projection. An explicit `columns:[]` keeps only `firstColumns`; omitting columns
keeps every column, after `firstColumns` and `columnsOrder`. Conflicting output
keys are refused. Inputs are never mutated; nested values can be shared with the
output, as with `list.take`.

`rows.read` supports `$`, `.key`, `[index]`, quoted keys and `[*]`, including a
relative dotted path. Wildcards produce an array **per input element**, not a
flattened list. A missing scalar path uses `defaultValue` (null by default);
explicit null/false/0/empty text are preserved. `skipMissing:true` omits missing
paths. Invalid JSON and invalid paths are errors. No eval, recursive descent or
inherited-property traversal. Text elements are parsed once; this is not a
streaming JSON parser.

All five blocks run on Rhino and in the browser with the same contract. Default
limits are 100,000 rows and 1,000,000 row × column operations / wildcard results
(`maxRows` / `maxCells`). Hard ceilings are 1,000,000 / 10,000,000, at most 4096
column/aggregation descriptors and JSON paths of 64 segments / 2048 characters.
Excess fails with `ROWS_LIMIT_EXCEEDED`; invalid options/values have explicit
`ROWS_*` codes. Long loops check cancellation. No user values or results are
cached across calls. Baserow-specific HTML and field options belong in a provider
adapter, not in this generic kernel.

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

The default bench alternates `RowsCells` (Flow block per cell) and `RowsArray`
(`rows.formatCells` once per array), with identical input, local filtering,
projection and exact expected output checked after every run. Pass a sixth
argument with an older engine `_flow` to include its cell baseline; the seventh
argument selects `cells,array` (default) or one variant. Profiles are separate
from timing. The array version executes three nodes regardless of row/cell count.

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
Refreshing or disposing one pooled Rhino runtime clears its local caches only;
it does not erase shared dependencies already computed for the new generation.
Explicit `cache.clear` and Studio cache-clear actions still invalidate them and
reject publication of an older in-flight schema analysis.

Compiled engine module code is shared through Convertigo's Rhino script cache;
each evaluation still creates independent exports and closures. Nothing caches a
result of a business block or a caller's credentials.

`tools/benchmark-json-xml.js` measures the existing Java JSON/XML round trip and
plain JSON serialization with identical row/cell payloads. It is a transport cost
measurement, not a direct-JSON requester implementation. XML/JSON requesters keep
their current contracts in this release.
