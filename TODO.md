# Flow POC TODO

## Authoring worker and snapshot index

- Keep Java as a generic Flow host, not as a Flow model owner. Java should know how to expose virtual objects, properties, icons, source editors, actions and mutations, but it must not know block semantics such as `http.request`, `config.use`, scopes, tags or FlowScript rules.
- Split the control plane from runtime execution. Studio, Admin and MCP calls should use an authoring/indexing path optimized for `describeTree`, palette/catalog, property definitions, picker context, schema/context, validation and code get/set/patch. Runtime execution stays in the current Convertigo request thread.
- Let the Flow engine project maintain Java-readable immutable snapshots: `qname -> node`, `children`, `properties`, `displayName`, `comment`, `icon`, `source`, `schema/context` and `revision`. Java reads snapshots quickly; Rhino rebuilds them when source files or project fingerprints change.
- Avoid global recomputation. Invalidate by engine qname, project dir, source path and revision/fingerprint. File refresh in Studio should debounce and reload only affected Flow/FlowEngine virtual objects when possible.
- Treat the future worker like a web worker: requests in, compact JSON snapshots out. The worker may stay hot for authoring/MCP, but runtime Flow execution must use an immutable plan and avoid sharing mutable execution scopes.
- Measure before deep refactor: bridge cache hits/misses, per-method duration, slow methods during project load, and MCP/Studio calls that trigger broad catalog or context rebuilds.

## Pause checkpoint

- Keep credits low for 24h: avoid broad refactors and new benchmarks unless explicitly restarted.
- Finish urgent cleanup only: remove alpha compatibility that makes the model ambiguous, especially obsolete Flow YAML sidecar fallback.
- Before merge to `develop`, squash noisy spike commits into readable milestones that future contexts can understand.
- Preserve meaningful milestones: Java bridge/cache, FlowScript canonical source, Flow MCP authoring workflow, Studio virtual tree/palette/property integration, runtime/catalog refactors.
- Re-run a minimal validation set before any merge: Studio load, `flow-cache-clear`, `flow-code-get/check/run`, Rhino smoke.
- Record benchmark evidence and raw traces in `convertigo-cir` when work resumes.
