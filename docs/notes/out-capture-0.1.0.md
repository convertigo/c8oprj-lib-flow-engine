# Output capture since engine 0.1.0

Engine 0.1.0 (24 September 2026) removed the former unprefixed `out` capture.
A block call such as `http.get({ url: config.url, out: "local.response" })`
is rejected when that block does not declare a business property named `out`.

Assign the call to capture its result:
```javascript
local.response = http.get({ url: config.url })
```
Or use the explicit engine attribute:
```javascript
http.get({ url: config.url, $$out: "local.response" })
```

Authors see `UNKNOWN_BLOCK_PROPERTY`: `out` is the former capture (before
engine 0.1.0); assign the call or use `$$out`. The hint shows both forms.
A declared business `out` remains business data and is not migrated.
Run `node tools/migrate-out-capture.js path/to/_flow/flows` to review changes.
Use `--catalog full-catalog.json` for the exact served block contracts if needed.
After reviewing the dry run, repeat the command with `--write` to apply it.
The offline tool is idempotent; any review item prevents all writes.
There is no load-time tolerance or migration: invalid sources remain errors
and canonical loading continues to reject them with `FLOWSCRIPT_CANONICAL_INVALID`.
