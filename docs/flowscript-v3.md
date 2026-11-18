# FlowScript v3

Status: draft specification (lot L3a, 18/11/2026). It is the single source for the reader, the validator,
the conformance test and the guides: the guides take their sections from it, and the conformance test runs every
`flowscript` example below. The machine-readable table is `flowscript-v3-grammar.json`.

Section 14 says how nodes without an author form (created in Studio, or read from a v2 source) are rendered:
the natural JavaScript form wherever the meaning is identical, the call form otherwise.

## 1. Principles

- A v3 source is a JavaScript program. Rhino 1.9.2 parses it (ES6) without any masking. The only preparation
  is a same-length rewrite of `const` to `let` in a `for…of` head, because Rhino 1.9.2 refuses `const` there.
- The reader lowers the program to Flow blocks. A v3 source is never executed as JavaScript by Rhino:
  Rhino 1.9.2 keeps the first value of a `const` declared in a block nested in a loop of the same function
  (Rhino #326, not fixed upstream). Each declaration becomes an assignment at every pass, so a `const` in a loop
  body takes its new value as in JavaScript: FlowScript v3 sources need no `const` → `let` correction
  (conformance case `C-CONST-LOOP`). The correction applies to the JavaScript Rhino runs, such as project blocks
  with `runtime: "rhino"`.
- **Same meaning as JavaScript.** When the JavaScript program would run without error, the Flow gives the same
  result, with the value rules of the FlowScript expression evaluator (shared with v2, unchanged by v3):
  - paths are null-safe: `local.a.b` is `undefined` when `local.a` is `null`, where JavaScript would throw
    (likewise `Object.keys(null)` is `[]`);
  - `<`, `<=`, `>`, `>=` compare two numeric texts as numbers: `"10" < "9"` is `false` (JavaScript compares the
    texts and says `true`); inputs often arrive as text;
  - a template literal writes `null` and `undefined` as `""`, and an object or a list as JSON;
  - loops have an execution budget: a `while` stops the run with `WHILE_ITERATION_LIMIT` after 1000 passes or
    60 s unless `flow.while` sets other bounds; a counted `for` gets the largest bound (1000000 passes, 60 s).
- Anything else whose meaning could differ is refused at its line, with a stable code and a proposed rewrite.
  It is never translated approximately.

## 2. File shape

```flowscript
const _flow = { sourceVersion: 3, inputs: { name: { type: "string", default: "Ada" } } }

const { trim } = flow.import("text")

function Greeting({ input, config, result }) {
  const name = trim({ text: input.name })
  if (name == "") {
    throw { code: "NAME_REQUIRED", message: "name is required" }
  }
  return { message: `Hello ${name}` }
}
```

- `const _flow = { sourceVersion: 3, … }` holds static literals only: `inputs`, `outputs`, `config`, `tests`,
  `accessibility`, `authenticatedContextRequired`.
- Imports come next, then the Flow function. A top-level function after it is a helper block, as in v2: one
  object parameter, `function total({ rows }) { … }`, called `total({ rows: input.rows })`; its body follows the
  same rules. A function anywhere else (nested, in an expression, a closure) is refused (`FLOWSCRIPT_V3_FUNCTION`).
- Semicolons are optional. The formatter writes one statement per line.

## 3. Imports

```flowscript
const _flow = { sourceVersion: 3 }

const { get: httpGet, post } = flow.import("http")
const requestable = flow.import("requestable")

function Imports({ input, config, result }) {
  const page = httpGet({ url: config.api.url })
  const contacts = requestable.call({ requestable: ".ListContacts", input: { limit: 10 } })
  return { status: page.status, contacts }
}
```

- `const { name, name: alias } = flow.import("module")` imports named blocks: `httpGet(…)` calls `http.get`.
- `const ns = flow.import("module")` imports a namespace: `requestable.call(…)` calls `requestable.call`.
- Only at the top level, before the functions, with a literal module name. No default value, rest or nested
  pattern.
- `flow` is reserved. It is neither declared nor imported (`FLOWSCRIPT_V3_RESERVED_NAME`).
- `import … from` is not JavaScript that Rhino accepts (`FLOWSCRIPT_V3_IMPORT_SYNTAX`, proposal: `flow.import`).

## 4. Locals, results and assignments

```flowscript
const _flow = { sourceVersion: 3, inputs: { items: { type: "array" } } }

function Totals({ input, config, result }) {
  let total = 0
  let count = 0
  for (const item of input.items) {
    total += item.amount
    count++
  }
  const { currency } = config.billing
  return { total, count, currency }
}
```

- `const x = …` and `let x = …` declare a local. The value is stored in `local.x`, and `x` reads it.
  A declaration without a value (`let found`) sets `undefined`, so a declaration in a loop body starts again at
  every pass, as in JavaScript.
- `local.x = …` remains valid. A Flow never names the same local both ways (`FLOWSCRIPT_V3_LOCAL_ALIAS`).
- One level of object destructuring is accepted: `const { a, b: c } = o` sets `local.a = o.a` and `local.c = o.b`.
  Defaults, rest and nested patterns are refused (`FLOWSCRIPT_V3_DESTRUCTURING`).
- `x += e`, `x -= e`, `x *= e`, `x /= e`, `x++`, `x--` are statements: `local.x = local.x + (e)`.
  They are refused inside an expression (`FLOWSCRIPT_V3_COMPOUND_CONTEXT`).
- `result.x = …` writes one output field. `return { … }` writes the output fields and leaves the Flow.
  A Flow uses one style or the other (`FLOWSCRIPT_V3_RESULT_MIXED`), because JavaScript returns the object
  alone while `result.x` accumulates.

**Scope rules** (refused otherwise):
- a name is read only inside the block that declares it (`FLOWSCRIPT_V3_OUT_OF_SCOPE`);
- a name is not declared again in an enclosed block, and does not hide an import or a loop variable
  (`FLOWSCRIPT_V3_SHADOWING`);
- a `const` is not assigned again; its object or list may still change (`FLOWSCRIPT_V3_CONST_ASSIGN`);
- a local takes neither the name of a scope (`input`, `config`, `local`, `result`, `request`, `current`, `parent`,
  `trace`), nor `flow`, nor a name starting with `__`, nor the name of a block namespace the Flow uses
  (`text`, `list`, `json`, `http`…): after `let text = …`, `text.trim({…})` would be a method call in JavaScript
  (`FLOWSCRIPT_V3_RESERVED_NAME`, `FLOWSCRIPT_V3_NAME_SHADOWS_BLOCK`).

## 5. Control flow

| JavaScript | Block | Rule |
|---|---|---|
| `if (c) {…} else if (d) {…} else {…}` | `if` | An `else if` is an `if` in `else`. A single statement is a body of one statement. |
| `while (c) {…}` | `while` | `maxIterations` 1000 and `timeoutMs` 60000. Other values: `flow.while({…})` (section 11). |
| `for (const item of items) {…}` | `forEach` | `item` reads the current element. One level of object destructuring: `for (const { id } of rows)`. |
| `for (let i = a; i < b; i++) {…}` | `set` and `while` | Only this form, `<` or `<=`, step `++`; `i` is not assigned in the body; no `continue` in its body. `maxIterations` 1000000. |
| `switch (x) { case "a": …; break; default: … }` | chain of `if` | Literal labels; every case ends with `break`, `return` or `throw`; `default` last. |
| `try {…} catch (e) {…}` | `try` | The error is `local.e`, read as `e` inside the catch only. Without a parameter: `local.error`. |
| `continue` | `next` | In a `while` or a `for…of`, without a label. |
| `return`, `return value`, `return {…}` | `return` | Leaves the Flow. Refused inside a loop (`FLOWSCRIPT_V3_RETURN_IN_LOOP`). |
| `throw { code: "LITERAL", message }` | `throw` | `code` is a literal public code. |

```flowscript
const _flow = { sourceVersion: 3, inputs: { orders: { type: "array" } } }

function OpenLabels({ input, config, result }) {
  const labels = json.array({ itemType: { type: "string" } })
  for (const order of input.orders) {
    if (order.status != "open") {
      continue
    }
    labels.push(`${order.id} ${order.customer}`)
  }
  try {
    email.send({ to: config.ops, subject: "Open orders", text: labels.join("\n") })
  } catch (failure) {
    result.mailError = failure.message
  }
  result.labels = labels
}
```

**Nested loops.** A loop variable is read in its own body. An inner loop does not read the variable of an outer
loop (`FLOWSCRIPT_V3_OUTER_LOOP_VARIABLE`): copy it first, `const order = item` at the top of the outer body.

## 6. Expressions

The v2 expression subset is unchanged: scope paths, literals, arrays, objects, template literals, `+ - * / %`,
`== != === !==` (`===` strict), `< <= > >=`, `&& || !`, `?:`, `??`, `typeof`, `value[key]`, the pure functions
(`Math.*`, `Number`, `String`, `parseInt`…) and the text, list and number methods of the v2 guide.

- `?.` is accepted and means `.`: paths are already null-safe.
- Write JavaScript methods: `name.toLowerCase()`, `text.includes(part)`, `list.length`, a template literal or `+`.
  The v2 functions (`lower`, `upper`, `trim`, `contains`, `length`, `json`) remain valid but differ on `null`
  (`lower(null)` is `""`), so sources are not rewritten.
- `??` keeps `0`, `false` and `""`; `||` replaces them. `flow.default(a, b)` replaces `null`, `undefined` and `""`.
- A regular expression literal is a block: `text.match`, `text.replace`, `text.split` (as in v2).

## 7. List methods

```flowscript
const _flow = { sourceVersion: 3, inputs: { rows: { type: "array" } } }

function Active({ input, config, result }) {
  const active = input.rows.filter(row => row.active)
  const names = active.map(row => row.name).join(", ")
  const first = input.rows.find(row => row.vip)
  const anyLate = input.rows.some(row => row.late)
  const sorted = active.toSorted((a, b) => b.score - a.score)
  const late = input.rows.filter(row => row.late).length
  return { names, first, anyLate, top: sorted.slice(0, 3), late }
}
```

| JavaScript | Block |
|---|---|
| `xs.filter(x => c)` | `list.filter({ items: xs, where: c })`, `x` read as `current` |
| `xs.map(x => e)` | `list.map({ items: xs, select: e })`; an object literal is written `x => ({ … })` |
| `xs.find(x => c)` | `list.find({ items: xs, where: c })`: `undefined` when nothing matches |
| `xs.some(x => c)`, `xs.every(x => c)` | `list.some`, `list.every` |
| `xs.toSorted((a, b) => a.k - b.k)`, `[...xs].sort(…)` | `list.sort({ items: xs, by: current.k, compare: "number" })`; `b.k - a.k` adds `direction: "desc"` |
| `xs.toSorted((a, b) => a.k.localeCompare(b.k))` | `list.sort({ items: xs, by: current.k, compare: "locale" })`; `b.k.localeCompare(a.k)` adds `direction: "desc"` |
| `includes`, `slice`, `join`, `concat`, `at`, `indexOf`, `length` | expression methods, no block |

- The function is an arrow with one parameter and an expression body without block call. `function (x) { return e }`
  is the same.
- A method is written in an assignment or a `return`. Methods chain: each block method becomes a node whose result
  feeds the next step through a hidden local `local.__chain<N>`.
- Refused, with a rewrite into two `const` (`FLOWSCRIPT_V3_CHAIN`): a step inside a branch of `?:`, `&&`, `||` or `??`;
  a step in an argument of an expression function; a step after a scope read of the same statement.
- Sorting keeps the JavaScript comparator: `compare: "number"` orders by `a - b` and `compare: "locale"` by
  `String(a).localeCompare(String(b))`, on a copy sorted by the engine's `Array.prototype.sort`, exactly as the
  arrow does: the sort is stable, and an absent key gives `NaN`, which the comparator treats as equal. With
  `compare: "locale"`, an absent key compares as the text `"undefined"`: this is the meaning of
  `String(a.k).localeCompare(String(b.k))`, while `a.k.localeCompare(b.k)` would fail in JavaScript; both forms
  give that `list.sort` (paths are null-safe, section 1). Without `compare`,
  `list.sort` keeps its Flow order (numeric texts as numbers, `null` as `""`), which no JavaScript comparator
  reproduces: it stays a call (section 14).
- Refused: `xs.sort(…)` alone (it sorts in place, `list.sort` returns a copy: write `toSorted`), other comparators,
  `reduce`, an index parameter `(x, i)`, a parameter of an outer arrow read in an inner one
  (`FLOWSCRIPT_V3_LIST_METHOD`).

## 8. Typed collections

- A list or a map is created typed: `const rows = json.array({ itemType: {…} })`, `const byId = json.map({ valueType: {…} })`.
- `rows.push(v)` is `json.push({ path: "local.rows", value: v })`; `byId[key] = v` is `json.put({ path: "local.byId", key, value: v })`;
  `order.status = "paid"` is a `set`, as in v2.
- `const rows = []` followed by `push` is refused (`FLOWSCRIPT_V3_UNTYPED_LIST`). The proposal is the `json.array`
  with the item type taken from the pushed values.

## 9. Global functions

In an assignment, a `return`, or at the head of a chain:

| JavaScript | Block |
|---|---|
| `Object.keys(o)`, `Object.values(o)` | `object.keys({ source: o })`, `object.values({ source: o })` |
| `JSON.parse(t)` | `json.parse({ text: t })` |
| `JSON.stringify(v)`, `JSON.stringify(v, null, 2)` | `json.stringify({ value: v })`, with `pretty: true` |

- Elsewhere, and with other arguments (replacer, reviver, other indent), they are refused (`FLOWSCRIPT_V3_GLOBAL_CALL`).
- `Object.entries` is refused: `for (const key of Object.keys(o)) { const value = o[key] … }`.
- `Date.now()` and `new Date()` are refused: use `date.now`, `date.format`… (time zone and format).
- `JSON.*` and `Object.*` remain refused inside other expressions, as in v2.

## 10. Errors

```flowscript
const _flow = { sourceVersion: 3 }

function Notify({ input, config, result }) {
  try {
    email.send({ to: config.ops, subject: "Report", text: "Done" })
  } catch (failure) {
    if (failure.code != "SMTP_UNAVAILABLE") {
      throw failure
    }
    result.queued = true
  }
}
```

- `throw { code: "LITERAL", message, details, status }` raises an application error, as in v2.
- `throw e`, where `e` is the parameter of the enclosing `catch` and is not assigned, raises the caught error
  unchanged: same code, message, details and status.
- `throw new Error(m)` is refused (`FLOWSCRIPT_V3_ERROR_CODE_CHOICE`). The public code is a choice:
  the proposal is `throw { code: "CHOOSE_ERROR_CODE", message: m }`.

## 11. Call forms

- Every block is called with one object of named properties: `sql.query({ connection, sql })`.
- A control block whose properties go beyond its JavaScript form keeps its call form, prefixed with `flow.`:
  `flow.while({ condition: …, maxIterations: 100000, $$nodes() { … } })`, `flow.forEach`, `flow.if`, `flow.try`.
  Its slots keep the v2 keys (`$$then`, `$$else`, `$$nodes`, `$$try`, `$$catch`).
- `$$id`, `$$out`, `$$disabled` and `$$comment` stay engine attributes of a call.

## 12. Names, comments and disabled statements

- A JavaScript label gives an explicit node name: `checkStock: if (…) { … }`. Without a label, names are computed.
- A comment directly above a statement, without a blank line, is its comment; a `/* … */` comment is read the same
  way, and the formatter writes it as `//` lines. Separated by a blank line, it is
  a standalone comment node.
- `// @disabled` in that comment disables the statement.

## 13. Refused constructs

| Construct | Code | Rewrite |
|---|---|---|
| `break` | `FLOWSCRIPT_V3_BREAK` | a local tested by the `while` condition, or `find` / `filter` |
| `finally` | `FLOWSCRIPT_V3_FINALLY` | the statements after the `try` |
| `return` inside a loop | `FLOWSCRIPT_V3_RETURN_IN_LOOP` | `continue`, or a local and a `return` after the loop |
| a `for (;;)` other than the counted form | `FLOWSCRIPT_V3_FOR_FORM` | `for…of` or `while` |
| `switch` with fall-through or non-literal cases | `FLOWSCRIPT_V3_SWITCH_FALLTHROUGH` | `if` / `else if` |
| `do … while`, `for … in`, labelled loops, labelled `break` / `continue` | `FLOWSCRIPT_V3_LOOP_FORM` | `while`, `for (const key of Object.keys(o))` |
| a function other than a top-level helper, a list arrow or a slot (nested, in an expression, a closure) | `FLOWSCRIPT_V3_FUNCTION` | write it inline, a top-level helper, or a project block |
| `async`, `await`, generators, classes, `this`, `new` | `FLOWSCRIPT_V3_UNSUPPORTED` | blocks |
| `if` or `while` whose condition is an object literal | `FLOWSCRIPT_V3_OBJECT_CONDITION` | `flow.if({ … })` |

```flowscript refused=FLOWSCRIPT_V3_BREAK
const _flow = { sourceVersion: 3, inputs: { items: { type: "array" } } }

function FirstLarge({ input, config, result }) {
  let found
  for (const item of input.items) {
    if (item.size > 10) {
      found = item
      break
    }
  }
  return { found }
}
```

```flowscript refused=FLOWSCRIPT_V3_ERROR_CODE_CHOICE
const _flow = { sourceVersion: 3 }

function Fail({ input, config, result }) {
  throw new Error("not ready")
}
```

## 14. Rendering nodes without an author form

A node created in Studio or by a tool, and every node read from a v2 source by the migration, has no author form
to keep. It is rendered in its **natural JavaScript form wherever the meaning is identical**, and in its call form
otherwise. The author's own writing is always kept (`const` or `let`, loop variable name, call form, `+=`,
`return { … }`, chains), through internal `__flowScript*` fields of the node that the definition comparison ignores.

**Natural by default:**

| Node | Rendering |
|---|---|
| `set` of a `local.`/`result.` path | `local.x = value`, `result.x = value` (no declaration is inferred) |
| `if` | `if (c) { … } else { … }`, an `if` alone in `else` as `else if` |
| `while` with default bounds | `while (c) { … }` |
| `forEach` | `for (const item of items) { … }`, `current` renamed in its own body |
| `next`, and a v2 bare `return` in a loop body | `continue` |
| `try` | `try { … } catch (failure) { … }`, named after its error local |
| `throw`, `return` | `throw { … }`, `return`, `return value` |
| `list.filter`, `list.map`, `list.find`, `list.some`, `list.every` | `items.filter(item => c)`… |
| `list.sort` with `compare` | `items.toSorted((a, b) => a.k - b.k)`, `… localeCompare …` |
| `json.push`, `json.put` | `local.rows.push(v)`, `local.byId[key] = v` |
| `object.keys`, `object.values`, `json.parse`, `json.stringify` | `Object.keys(o)`, `Object.values(o)`, `JSON.parse(t)`, `JSON.stringify(v)` / `JSON.stringify(v, null, 2)` |
| a disabled statement | its natural form with `// @disabled` in its comment |

**Names.** The variable of a `for…of` and the parameter of a list arrow are `item`; when that name is visible
already, the first free of `item2`, `item3`… The parameter of `catch` is the name of the error local
(`error: "local.failure"` gives `catch (failure)`).

**Exceptions: the call form is kept.** Each one has its case in `flowscript-v3-rendering-cases.json`; the
conformance test renders it, reads the rendering back and checks the same definition.

| Case | Node | Why the natural form is not used |
|---|---|---|
| `R-SORT-FLOW` | `list.sort` without `compare` | its Flow order (numeric texts as numbers, `null` as `""`) has no exact JavaScript comparator |
| `R-WHILE-BOUNDS` | `while` with `maxIterations` or `timeoutMs` other than the default, or with `iterations` / `completed` | `while (c)` cannot carry them: `flow.while({ … })` |
| `R-TRY-DESTINATION` | `try` whose `error` is not a simple local `local.<name>` | `catch (e)` declares a local only |
| `R-TRY-ESCAPE` | `try` whose error local is read or written outside its catch body, or whose name is already visible | the `catch` parameter exists only inside the catch: `flow.try({ … })` |
| `R-LIST-BLOCK` | `list.filter`, `list.map`, `list.find`, `list.some`, `list.every` whose `where` or `select` contains a block | an arrow body has no block call |
| `R-LIST-NO-WHERE` | `list.filter`, `list.find`, `list.some`, `list.every` without `where` | no arrow to write |
| `R-INCOMPLETE` | a node without the property its natural form needs (`forEach` or a list method without `items`, `if` or `while` without `condition`) | the natural form would be invalid JavaScript or say something else |
| `R-OBJECT-CONDITION` | `if` or `while` whose condition is an object literal | `if ({ … })` is always true in JavaScript: `flow.if({ … })` |
| `R-STRINGIFY-PRETTY` | `json.stringify` whose `pretty` is an expression | only `JSON.stringify(v)` and `JSON.stringify(v, null, 2)` are exact |
| `R-ATTRIBUTES` | a node with a disagreeing `$$out`, an explicit name that is not a JavaScript label, or a `set` with more properties | as in v2 |
| `R-NESTED` | a block written inside the property of another block | it is not a statement |
| `R-NO-NATURAL` | every other block (`sql.query`, `forEachChunk`, `flow.poll`…) | it has no natural form: a call is its JavaScript |
