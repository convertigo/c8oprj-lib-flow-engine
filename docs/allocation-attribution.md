# Allocation attribution

The Java engine option `timing.trace.allocations` is false by default. It is
independent of `timing.trace`: leave timing traces disabled to preserve prepared
node execution. This is a diagnostic, not a response payload or an authorization
mechanism. The object-result bridge supplies a third optional `runObject`
argument only during attribution. Older providers ignore it.

The Java collector uses ThreadMXBean and a shared request record inherited by
requestable workers, with a separate stack on each thread. Nodes, dynamic calls,
input encoding/parsing, internal calls and caller conversion, HTTP JSON parsing,
normalization, handle checks, result sanitization, detachment and servlet writing
are measured. HTTP transport itself remains in its `http.request` block. Worker
and servlet exclusive counters include framework work outside these boundaries.
The HTTP client's asynchronous I/O threads are not requestable workers and are
not included. This matches the whole-request qualification probe's boundary.

Each `(Allocations)` log fragment has a generated request id, part/parts,
allocatedBytes, workers and entries. Reassemble every part before using a record.
An entry includes kind, id, type, count, inclusive and exclusive bytes. Exclusive
bytes partition the participating threads; never sum inclusive nested spans.
The collector also reports `inclusiveNanos` and `exclusiveNanos`, measured with
`System.nanoTime()`. These are elapsed durations, including waits, rather than CPU
time. A servlet waiting for a worker overlaps that worker's elapsed duration:
do not sum durations across threads to reconstruct HTTP latency. Runtime phase
spans identify plan resolution/compilation, node preparation, metadata, input
contracts/bindings, context creation and traces in addition to the block spans.
Node ids combine the requestable QName, first-execution ordinal of the node
object in that invocation, and its authored id. Ordinals distinguish anonymous
nodes but can differ across branches. Group by type to compare different paths.
No request inputs, results, URLs, headers or credentials are recorded.

Labels are bounded (kind 32, id 128, type 96 UTF-16 characters); at most 4096
keys plus an overflow bucket are retained per request. Completion waits for
registered workers, including a worker that finishes after its servlet. A worker
that starts only after completion is outside this measurement. Counter support
is required; unsupported JVMs do not activate it.

Disabled execution does not create spans, read allocation counters, populate
node maps, or emit records. It retains constant condition checks. Enabled
execution allocates counter and logging structures: calibrate against a separate
uninstrumented total and report this overhead. Thread allocation is cumulative
allocation, not live or retained heap. The complete log serialization happens
after the collector's servlet counter closes, so an outer qualification probe
also includes that diagnostic output cost.

Tests cover concurrent roots/nested workers, exclusive accounting, error cleanup,
late worker completion, nested request restoration, disabled execution and the
optional JavaScript protocol (including a failed node and pool reuse).
