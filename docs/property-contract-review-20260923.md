# Typed properties and collections — implementation checklist

Approved direction (Nicolas, 2026-09-23): static Output destinations; explicit
collection operations; array item / dictionary value types exist even when empty.
Shared descriptors, schema rules and portable JS behavior for backend and frontend.
Java hosts do not know block ids or property kinds. Do not deploy or push this lot
until qualified. Existing Studio reconciliation work remains separate.

## User review — acceptance inventory

- [ ] Every business property reviewed: literal, dynamic, enum, special reference.
- [x] Numeric left/right, log/throw messages and probe label expose their pickers in the projected descriptor (host integration still to qualify).
- [x] Public block identifier shown independently of implementation filename in backend projection.
- [ ] Single meaningful Output; distinguish business destinations from block results.
- [ ] Output picker uses static writable destinations; input/config are not targets.
- [ ] Flow call target picker plus contract-aware input mapping.
- [ ] Use/contract and probe documentation with executable examples.
- [ ] Logger choices and behavior agree (no silently accepted custom logger).
- [ ] Reveal implementation via provider capability, in Eclipse and web.
- [ ] Clear name/purpose for the disposable FlowBlockGallery1 qualification copy.

## Collection slice

- [x] Portable schema compatibility with unknown distinct from compatible (bounded schema subset).
- [x] Empty typed array/dictionary creation, explicit type or copied known source schema (isolated backend).
- [x] Typed append and dictionary put, target selected using a write picker (isolated backend).
- [ ] Static diagnostics and runtime checks preserve the declared schema.
- [x] Reuse existing json.push/list vocabulary rather than duplicate semantics.
- [x] Frontend reactive writes and backend writes follow the same contract (isolated qualification; live Studio pending).
- [ ] Backend/frontend analysis, execution, UI editing, Save/Reload qualification.

New validations and precise remaining limits are recorded here as each slice lands.

## Slice 1 — prepared, not deployed

- The provider resolves `editorMode` (text/choice/custom); Java no longer infers
  the editor from property names, block ids or its own list of kinds.
- Backend and frontend engine properties use the same type/editor resolution.
- The Value editor offers a typed literal, expression and Advanced view. Switching
  views preserves the draft. Numbers, booleans and enumerations do not need JSON.
- Output visibility comes from `outputs.out.hidden/expert`. Set, log, return,
  throw, if and forEach hide a redundant/irrelevant capture by default; an existing
  capture stays accessible in Expert. This is not the completed destination contract.
- Log level/logger offer declared literal choices. Existing custom logger names
  still fall back to context; the description now says so. No runtime change.
- Use and probe explanations clarified; specialized reference pickers and tested
  contract examples remain pending.

Validation: Rhino property-editor-contract, frontend-projected-contract and
source-block-dialect (23 checks), plus frontend-rename-projection using the real
Svelte provider on a temporary linked project; Node value-editor DOM, property-editor host,
builder, template-object editor and compiled scope writes; six Java editor host
scenarios; full changed Eclipse class compiled with Java 21 against installed
Eclipse dependencies, into temporary output only.

Real browser interactions on an isolated page using the production components:
numeric literal edit, boolean toggle, enum choice, source insertion, expression /
Advanced roundtrip, mixed text/source message. No Studio project modified.
Eclipse and web Studio live integration remains to qualify after coordinated
provider + plugin integration.

The broad smoke suite stops at its duplicate virtual QName assertion (line 1404).
Reproduced unchanged on an archived clean bb56e56 baseline: not introduced by this
slice, but the suite is not green and later assertions were not executed.

## Slice 2 — static destinations, prepared, not deployed

- One pure JS `destination-contract.js` owns the named-path grammar and backend
  writable roots (`local`, `result`). No Java dispatch or per-block allowlist.
- The parser preserves literal destinations, including their types: it no longer
  converts false into local.false or strips the template braces from a destination.
- Analysis and context use the same contract; runtime validates engine outputs and
  descriptor-declared write properties before running a block. Prepared dispatch,
  profiled execution and ctx.callBlock obey the guard. Business out remains independent.
- Trusted internal writers retain their own scope policy (trace.probes works), with
  the same safe path syntax and own-property traversal. Array/scalar parents reject
  field writes; prototype-bearing paths, root replacement and array indexes reject.
- The shared path editor filters writable names, explains invalid input and keeps
  its initial value intact. Source Picker Apply honors validity. Read pickers retain
  their sources/indexes. Another environment can pass its own roots explicitly.
- Compiler/editor cache fingerprints include the shared contract.

Proofs: Node destination-contract, destination-editor-dom (real component plus full
host Apply guard), lazy preparation, runtime service reuse, shared snapshots,
shared module contract, editor host/builder and scope writer. Real Rhino
destination-runtime-contract covers interpreted/prepared/profiled execution,
parser/analysis/context, pre-effect rejection, ctx.callBlock, internal trace and
v1/v2/business out. Property-editor-contract, source-expression-references (32),
source-parser-properties, source-block-dialect (23), backend-provider-authoring,
runtime-response-safety and frontend-projected-contract pass.
The old runtime-reuse fixture lacked nodeOutputPath and still counted the frame
before sourceVersion was added; its adapter/counts were brought up to date.
The global smoke still stops at the identical pre-existing QName assertion at 1404.

Real browser: Output no longer lists input.count, rejects input.count and a computed
map target with inline feedback, then accepts local.total from the picker. Isolated
page only, not live Studio or a generated frontend runtime.

## Contract gaps identified before slice 3 (frontend connection now in slice 4)

The backend destination policy is implemented and tested, but live integration
in Eclipse/web is not qualified. Frontend execution must supply its own write
adapter/policy; do not confuse a shared HTML editor with a qualified frontend runtime.

The frontend portable catalog currently drops mode=write properties. Typed
collection targets therefore need a portable reference/effect contract and a
reactive host adapter, not just a browser push implementation. Existing json.push
and list.map provide behavior/schema hooks to reuse. Declared empty collection
types must not be inferred from the first observed runtime item.

## Slice 3 — typed collections, prepared, not deployed

- Pure `schema-contract.js`: compatible/incompatible/unknown, recursive objects,
  arrays and maps, required fields, nullability and scalar enums. Unsupported
  constraints fail closed. This is a bounded contract, not a full JSON Schema engine.
- Shared schema web component: type choices, named/required object fields, array
  item types, map value types, and copying a known scope schema (or its item type).
  No JSON entry required for these shapes. Unknown sources are not offered as proof.
  Unsupported existing schemas remain intact and block Apply. Nested roundtrip and
  duplicate field protection tested with the real host. Enum editing remains pending.
- New `json.array`/`json.map` declare empty collections; `json.put` handles dynamic
  keys and typed values. Existing `json.push` reuses the same per-execution contract.
  Destinations stay static. `targetType` restricts known incompatible picker targets
  without confusing the reference's string value with its referent's data type.
- Declared types live outside serialized data, scoped to each execution/root object.
  Compiled and interpreted writes enforce declared paths, including replacement of
  an ancestor and writes into a typed map. Append/put reject incompatible values
  before mutation. The normal result serialization guard runs before these mutations.
- Analysis retains an explicit declaration instead of widening it after a bad push.
  Unresolved expressions/child computations produce a warning, not fake compatibility.
  The parser now preserves schema objects as static literal data rather than text.
  Compiler/editor cache keys include the common contracts. No new Java changes.

Proofs: schema-contract, typed-scope-contract, schema-editor-dom (component and host),
destination-editor-dom, shared-engine-module-contract (54 shared/2 local), property
editor host/builder, lazy preparation/runtime reuse/shared snapshot and scope writer.
Real Rhino typed-collections-runtime: empty types, append/map keys, invalid values,
prepared/profiled replacement, static diagnostics, known-schema picker, projected
editor, mutation/render/reparse. Previous destination, property editor, parser,
source dialect, backend authoring, response safety and frontend projection suites pass.
Real browser: field addition, duplicate rejection, rename and nested numeric array,
plus light-theme visual check. Preview only; not Studio acceptance.

Limits before integration: frontend reactive execution is not connected; constructors
remain backend-only. Native escape-hatch mutation is not sandboxed by this contract.
Full alias/branch/graph-call static propagation, schema keyword/reference extensions,
performance for large growing collections, and both live Studio surfaces remain to
qualify. The pre-existing broad smoke QName failure is unchanged/not resolved here.

Legacy business properties named out still coexist with the v2 engine $$out.
Do not infer an alias from the spelling: v2 permits real business properties
with that name. Audit core descriptors and preserve existing sources explicitly.

## Slice 4 — frontend connection, prepared, not deployed

- Portable descriptors declare write references, schema properties, state effect
  and collections capability. No block-id switch in Java or frontend adapters.
- Exact Engine destination/schema/typed-scope modules bundled from the explicit
  referenced provider. Frontend adapter publishes immutable validated values to
  writable State cells, rejects Derived and unavailable/dynamic destinations,
  guards SetValue replacement and isolates component instances/cell lifetimes.
- Declared empty collection types feed the picker and generated TypeScript, not
  inferred from the first item. Provider editorContext drives the shared editor.
  Context refresh preserves Source Picker drafts as well as property-dialog drafts.
- 33 provider regression tests pass, including actual Svelte client compilation
  and reactive DOM, invalid append/put/replacement and unchanged setter counts.
  Provider build, generated application check (0 errors/warnings) and production
  build pass. Real browser clicks update array count and map value; reload resets.
- Node/Rhino core/property/context suites remain green. Full provider tsc retains
  the identical nine diagnostics reproduced on clean ec5dedf; broad Engine QName
  smoke and removed migration fixture remain known unrelated failures.

Remaining gates: coordinated integration after Studio shutdown; live Eclipse AND
web picker/edit/Save/Reload. Frontend static value-type analysis parity, nested
destination picker, push child computations and large collections are not qualified.
No commit, push, active project mutation or new Java change in this slice.

## Slice 5 — integrated, live qualification incomplete

After the confirmed Studio shutdown, the four prepared slices were integrated
in the active checkouts without commits/pushes. Provider and web builds pass;
PDE compiled the generic Java editor host and the native Studio was relaunched.
Targeted 33 provider / 32 web / 6 Java host cases and Node/Rhino contracts pass.

Live web recipe on FlowBlockGallery1: invalid destination disables Apply even
after closing the picker; literal/expression edits, Apply, discard via Reload,
Save then Reload verified. The qualification flow was restored byte-for-byte.
Two generic defects fixed during this recipe: a composed native input event
reset custom-editor validity, and cached tree node identities kept stale child
labels after Reload. Host validity propagation and recursive revision signalling
now cover these paths without block-specific rules.

BLOCKING: a numeric literal replacing a template is still serialized as text.
FlowVirtualObject.parseEditedValue uses the old value's Java type instead of the
provider property contract. A proper editor-text conversion contract is needed;
no ad hoc numeric/boolean coercion fix added. Include boolean↔expression and
null/object/scalar transitions in the same contract and both Studio surfaces.

Native dialog acceptance is still pending: automation can select the tree and
Properties but the property-dialog click fails in the accessibility tool. This
is not a Studio exception. No global milestone acceptance is claimed.
See CIR concepts/session-2026-09-23-typed-studio-integration.md for exact evidence.
