# Backend inputs, CSV and asynchronous jobs

Use the standard blocks instead of a project Rhino bridge. These server-only
blocks are listed by `flow-catalog`; browser actions call the resulting Flow.

## Preserve the native request contract

```javascript
const _flow = {
  accessibility: "private",
  authenticatedContextRequired: true,
  inputs: {
    apikey: { type: "string", visibility: -1 },
    files: { type: "array", items: { type: "string" }, isFileUpload: true },
  },
}
```

`visibility` is the native visibility bitmask: `-1` masks all displays,
`0` leaves the value visible; `1/2/4/8` mask Logs/Studio/Platform/XML.
Do not put a secret default in the source; use a `.secret` symbol in config.
`isFileUpload: true` is copied to the generated native variable, including
multivalued variables. An upload arrives as a server file path. The native
upload mechanism owns its temporary file; do not publish that path.

`authenticatedContextRequired` is a boolean copied to the Flow's native
property. It requires a Convertigo authenticated context in addition to the
chosen accessibility. Explicit `false` and `0` reset these properties; omitted
properties preserve the existing native settings. Invalid property types are
errors, not truthy coercions. Promotion persists them for project reload.
`flow-sync-inputs({project, name})`, or `{project, qname}`, synchronizes one
existing Flow without editing its source.

## Parse CSV into typed rows

```javascript
local.file = list.first({ items: input.files })
local.csv = csv.parse({
  path: local.file,
  separator: ";",
  header: true,
  rowSchema: {
    type: "object",
    additionalProperties: false,
    required: ["id"],
    properties: {
      id: { type: "integer", title: "Identifiant" },
      label: { type: "string", title: "Libellé" },
      active: { type: "boolean", title: "Actif" },
      due: { type: "string", format: "date", title: "Échéance" },
    },
  },
  maxRows: 10000,
  maxBytes: 16777216,
})
result.rows = local.csv.rows
```

Supply exactly one of `text` or `path`. Relative file paths resolve from the
project; absolute uploaded paths are accepted. Files must be UTF-8 (with or
without BOM). Quoted separators, doubled quotes, multiline cells, CRLF and LF
are supported. Blank records are skipped; a quoted empty cell is a record.
A trailing record separator does not add a row. Malformed quotes, duplicate
or unsafe headings and inconsistent column counts are errors.

`rowSchema` accepts the row schema returned by `data.rowSchema`. Headings map
to property keys or their unique `title`. Without a schema all cells remain
strings, including `001` and `=1+1` (the parser never evaluates formulas).
Optional `columns: ["label", "id"]` chooses fields and order; entries can
also be `{field:"label", header:"Nom de l'article"}`. Missing or ambiguous headings
are refused. `header:false` requires ordered `columns`.

For the data contract, pass `rowSchema: local.schema` from `data.rowSchema`
and `resource: local.resource` from its provider (for example `sql.table`).
The schema's `key`/`values` envelope is preserved in each returned row; the
Resource supplies human labels and logical date types. `int64` and `decimal`
remain exact strings as in the data contract. Alternatively pass
`local.schema.properties.values` for flat values only. `columns` uses the
same `{field,header}` selection as `data.exportCsv`. Dates must still be ISO,
not a localized export display; the parser never guesses a locale date.
No optimistic revision is invented: read it before updating an existing row.

Types follow Flow input conversion, including JSON object/array cells.
Dates and date-times must be strict ISO; `2026-02-30` is refused. Convert a
localized date explicitly before writing business data. Decimal text that
must remain exact can use a string field in the row schema. Optional empty
non-text cells are absent unless nullable; schema `required` is enforced.

Output: `{rows, rowCount, columns, rowSchema, byteLength}`. Parsing has no
side effect on a database. Validate the returned rows, then write with your
data provider's transaction contract. This is the reading counterpart of
`data.exportCsv`, not an implicit bulk write.

Defaults: `separator:";"`, `header:true`, `maxRows:10000`, `maxBytes:16777216`.
Hard limits: 100000 rows, 16 MiB UTF-8 and 1024 columns. File reads are bounded
and closed even on errors/cancellation. Exceeding a limit refuses the whole
parse: no truncated successful result. Errors include
`CSV_ROW_LIMIT_EXCEEDED`, `CSV_BYTE_LIMIT_EXCEEDED`, `CSV_SYNTAX_INVALID`,
`CSV_HEADER_INVALID`, `CSV_COLUMN_COUNT` and `CSV_CELL_TYPE_INVALID`;
cell errors carry a record number and field key, without echoing its value.

## Wait for an asynchronous job

```javascript
local.poll = flow.poll({
  until: local.job.body.status == "finished",
  intervalMs: 1000,
  timeoutMs: 30000,
  maxAttempts: 30,
  $$nodes: function () {
    local.job = http.request({ method: "GET", url: config.jobs.statusUrl, connectTimeoutMs: 5000, readTimeoutMs: 5000 })
  },
})
result.job = local.job.body
```

One attempt runs before `until` is tested. Child nodes run in the caller scope.
A false condition yields the thread with `flow.wait` before another attempt;
there is no active CPU loop. Errors from an attempt propagate. Attempts and
elapsed time are bounded; exhaustion raises HTTP 504 `POLL_TIMEOUT`, with
attempts and configured limits. Cancellation is checked during waits and
before/after each attempt. A budget cannot interrupt a child I/O already in
flight: set that HTTP/requestable's own timeout as well.

`flow.poll` bounds: `intervalMs` 10..10000 (default 1000), `timeoutMs`
1..600000 (default 30000), `maxAttempts` 1..10000 (default 30).
Output: `{attempts, elapsedMs, completed}`. `flow.wait({delayMs:250})` is the
single-delay primitive, 0..60000 ms (default 1000); returns `{waitedMs}`.
Do not add `Thread.sleep`, recursive retry blocks or an unbounded loop.

## Invalidate an application cache

```javascript
result.invalidated = project.cacheRemove({ key: "table_id_cache" })
```

This uses the current project's native `context.project.get/set` store and
sets the exact key to null, so it also invalidates legacy Java Map caches.
Output: `{key, removed}`; a missing key is an idempotent `removed:false`.
The key is a value, not a property path. It cannot select another project or
clear the Flow catalog/response cache. A live Convertigo context is required;
standalone execution does not silently pretend to invalidate a cache.
This is transient shared application state, not durable storage or a secret
store. Keep user-specific data scoped by identity in the application design.

## Application logout

`session.authenticate({user:""})` clears the authenticated identity. Use it
in the application's logout Flow, then clear the displayed user and password
state and disable automatic credential replay. Test a protected read with the
same cookie after logout: clearing the screen alone is not a server logout.
This does not destroy all unrelated state stored in the HTTP session.
