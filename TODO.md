# Flow POC TODO

## Pause checkpoint

- Keep credits low for 24h: avoid broad refactors and new benchmarks unless explicitly restarted.
- Finish urgent cleanup only: remove alpha compatibility that makes the model ambiguous, especially obsolete Flow YAML sidecar fallback.
- Before merge to `develop`, squash noisy spike commits into readable milestones that future contexts can understand.
- Preserve meaningful milestones: Java bridge/cache, FlowScript canonical source, Flow MCP authoring workflow, Studio virtual tree/palette/property integration, runtime/catalog refactors.
- Re-run a minimal validation set before any merge: Studio load, `flow-cache-clear`, `flow-code-get/check/run`, Rhino smoke.
- Record benchmark evidence and raw traces in `convertigo-cir` when work resumes.
