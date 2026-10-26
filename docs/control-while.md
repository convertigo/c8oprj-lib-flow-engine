# Bounded while control

`while` runs its `$$nodes` body without a delay while `condition` is truthy.
It evaluates the condition before the first iteration, so the body may never run.
The body uses the caller's scopes and may update locals used by the condition.

```javascript
local.page = 1
while({
  condition: local.page !== null,
  maxIterations: 1000,
  timeoutMs: 60000,
  $$nodes: function () {
    local.answer = example.readPage({page: local.page})
    local.page = local.answer.next
  }
})
```

`maxIterations` is required, with default `1000`, and accepts integers from
1 to 1,000,000. The optional `timeoutMs` defaults to 60,000 and accepts integers
from 1 to 600,000. The enclosing request's cancellation also applies. Both are
checked every turn, including an empty body. Bound child I/O separately: these
cooperative controls cannot interrupt an in-flight blocking child call.

The output is `{iterations, completed}`. A false condition returns
`completed: true`; a child return/stop leaves the loop with `completed: false`.
Child failures propagate. A still-true condition after the iteration bound raises
`WHILE_ITERATION_LIMIT`; an expired budget raises `WHILE_TIMEOUT`; invalid bounds
raise `WHILE_LIMIT_INVALID`. Errors retain the loop node's location.

Use this block for bounded pagination or computation. Keep `flow.poll` for an
external condition that needs time to change: it deliberately waits between
attempts. The parser/writer, palette and hooks discover `while` from its standard
block descriptor; its icon reuses the carried `mdi:repeat` source.

The prepared runtime compiles the condition once. Iteration counters and clocks
remain local to each invocation, including nested and concurrent calls.

The MCP guide must add this core block, its `$$nodes` slot, required iteration
bound and distinction from `flow.poll`, with a pagination example. The MCP
library itself is outside this change.
