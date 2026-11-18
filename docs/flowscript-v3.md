# FlowScript v3

Status: draft specification (lot L3a, 18/11/2026). It is the single source for the reader, the validator,
the conformance test and the guides: the guides take their sections from it, and the conformance test runs every
`flowscript` example below. The machine-readable table is `flowscript-v3-grammar.json`.

Not covered yet: how nodes without an author form (created in Studio, or read from a v2 source) are rendered.
That choice is pending and will be added as its own section.

## 1. Principles

- A v3 source is a JavaScript program. Rhino 1.9.2 parses it (ES6) without any masking. The only preparation
  is a same-length rewrite of `const` to `let` in a `for…of` head, because Rhino 1.9.2 refuses `const` there.
- The reader lowers the program to Flow blocks. A v3 source is never executed as JavaScript by Rhino:
  Rhino 1.9.2 keeps the first value of a `const` declared in a loop body.
- **Same meaning as JavaScript.** When the JavaScript program would run without error, the Flow gives the same
  result. Flow differs only where JavaScript would throw: paths are null-safe (`local.a.b` is `undefined` when
  `local.a` is `null`), `Object.keys(null)` is `[]`.
- Anything whose meaning could differ is refused at its line, with a stable code and a proposed rewrite.
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
- Imports come next, then the Flow function. Other functions in the file are helpers, as in v2.
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
| `for (let i = a; i < b; i++) {…}` | `set` and `while` | Only this form, `<` or `<=`, step `++`. No `continue` in its body. |
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
| `xs.toSorted((a, b) => a.k - b.k)`, `[...xs].sort(…)` | `list.sort({ items: xs, by: current.k, direction: "asc" })`; `b.k - a.k` is `"desc"`; `a.k.localeCompare(b.k)` is `"asc"` |
| `includes`, `slice`, `join`, `concat`, `at`, `indexOf`, `length` | expression methods, no block |

- The function is an arrow with one parameter and an expression body without block call. `function (x) { return e }`
  is the same.
- A method is written in an assignment or a `return`. Methods chain: each block method becomes a node whose result
  feeds the next step through a hidden local `local.__chain<N>`.
- Refused, with a rewrite into two `const` (`FLOWSCRIPT_V3_CHAIN`): a step inside a branch of `?:`, `&&`, `||` or `??`;
  a step in an argument of an expression function; a step after a scope read of the same statement.
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
- A comment directly above a statement, without a blank line, is its comment. Separated by a blank line, it is
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
| a function outside a list method or a slot, a closure | `FLOWSCRIPT_V3_FUNCTION` | write it inline, or a project block |
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
