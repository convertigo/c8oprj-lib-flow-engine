# FlowScript v3

Status: draft specification (lot L3a, 18/11/2026). It is the single source for the reader, the validator,
the conformance test and the guides: the guides take their sections from it, and the conformance test runs every
`flowscript` example below. The machine-readable table is `flowscript-v3-grammar.json`.

Section 14 says how nodes without an author form (created in Studio, or read from a v2 source) are rendered:
the natural JavaScript form wherever the meaning is identical, the call form otherwise.

## 1. Principles

- A v3 source is a JavaScript program. Rhino 1.9.2 parses it (ES6) without any masking. The only preparation
  is a same-length rewrite of each `const` declaration keyword to `let`: Rhino 1.9.2 refuses `const` in a `for…of`
  head, and gives a `const` the scope of its whole function, so that a `const` declared again in a sibling block or a
  later `for…of` (valid JavaScript) is a redeclaration error for its parser (conformance case `C-CONST-BLOCK-SCOPE`).
  The reader takes `const` from the source text.
- The reader lowers the program to Flow blocks. A v3 source is never executed as JavaScript by Rhino:
  Rhino 1.9.2 keeps the first value of a `const` declared in a block nested in a loop of the same function
  (Rhino #326, not fixed upstream). Each declaration becomes an assignment at every pass, so a `const` in a loop
  body takes its new value as in JavaScript: FlowScript v3 sources need no `const` → `let` correction
  (conformance case `C-CONST-LOOP`). The correction applies to the JavaScript Rhino runs, such as project blocks
  with `runtime: "rhino"`.
- **Same meaning as JavaScript.** When the JavaScript program would run without error, the Flow gives the same
  result, with the value rules of the FlowScript expression evaluator (shared with v2, unchanged by v3):
  <!-- fragment:value-rules -->
  - paths are null-safe: `local.a.b` is `undefined` when `local.a` is `null`, where JavaScript would throw
    (likewise `Object.keys(null)` is `[]`);
  - `<`, `<=`, `>`, `>=` compare two numeric texts as numbers: `"10" < "9"` is `false` (JavaScript compares the
    texts and says `true`); inputs often arrive as text;
  - a template literal writes `null` and `undefined` as `""`, and an object or a list as JSON;
  - loops have an execution budget: a `while` stops the run with `WHILE_ITERATION_LIMIT` after 1000 passes or
    60 s unless `flow.while` sets other bounds; a counted `for` gets the largest bound (1000000 passes, 60 s).
  <!-- /fragment -->
- Anything else whose meaning could differ is refused at its line, with a stable code and a proposed rewrite.
  It is never translated approximately.

## 2. File shape

```flowscript id=file-shape
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

```flowscript id=imports
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

```flowscript id=locals-totals
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
- `x += e`, `x -= e`, `x *= e`, `x /= e`, `x++`, `x--` are statements: `local.x = local.x + (e)`; `x++` is
  `local.x = Number(local.x) + 1`, since JavaScript converts `x` to a number first (`"1"` gives `2`, not `"11"`).
  The same applies to a field of a local object or of `result`: `o.count++` is `local.o.count = Number(local.o.count) + 1`.
  They are refused inside an expression (`FLOWSCRIPT_V3_COMPOUND_CONTEXT`).
- `result.x = …` writes one output field. `return { … }` writes the output fields and leaves the Flow.
  A Flow uses one style or the other (`FLOWSCRIPT_V3_RESULT_MIXED`), because JavaScript returns the object
  alone while `result.x` accumulates.

<!-- fragment:scope-rules -->
**Scope rules** (refused otherwise):
- a name is read only inside the block that declares it (`FLOWSCRIPT_V3_OUT_OF_SCOPE`);
- a name is not declared again in an enclosed block, and does not hide an import or a loop variable
  (`FLOWSCRIPT_V3_SHADOWING`);
- a `const` is not assigned again; its object or list may still change (`FLOWSCRIPT_V3_CONST_ASSIGN`);
- a local takes neither the name of a scope (`input`, `config`, `local`, `result`, `request`, `current`, `parent`,
  `trace`), nor `flow`, nor a name starting with `__`, nor the name of a block namespace the Flow uses
  (`text`, `list`, `json`, `http`…): after `let text = …`, `text.trim({…})` would be a method call in JavaScript
  (`FLOWSCRIPT_V3_RESERVED_NAME`, `FLOWSCRIPT_V3_NAME_SHADOWS_BLOCK`).
<!-- /fragment -->

## 5. Control flow

<!-- fragment:control-flow -->
| JavaScript | Block | Rule |
|---|---|---|
| `if (c) {…} else if (d) {…} else {…}` | `if` | An `else if` is an `if` in `else`. A single statement is a body of one statement. A list method or a global call that `c` always evaluates (not after `&&`, `\|\|` or `??`, in a branch of `?:` or in a call argument) runs before the `if`, in a hidden local. |
| `while (c) {…}` | `while` | `maxIterations` 1000 and `timeoutMs` 60000. Other values: `flow.while({…})` (call forms). No list method in `c`, evaluated before every pass (`FLOWSCRIPT_V3_CHAIN`). |
| `for (const item of items) {…}` | `forEach` | `item` reads the current element. One level of object destructuring: `for (const { id } of rows)`. `items` may be `Object.keys(o)`, `Object.values(o)` or a list method chain, computed once before the loop. |
| `for (let i = a; i < b; i++) {…}` | `set` and `while` | Only this form, `<` or `<=`, step `++`; `i` is not assigned in the body. `continue` is accepted, even when `b` changes in the body: the counter steps before the body, on a hidden local. `maxIterations` 1000000. |
| `switch (x) { case "a": …; break; default: … }` | chain of `if` | Literal labels; every case ends with `break`, `return` or `throw`; `default` last. |
| `try {…} catch (e) {…}` | `try` | The error is `local.e`, read as `e` inside the catch only. `catch {…}` declares no name: the error goes to `local.error`, or to a hidden local when the Flow has its own `error`. |
| `continue` | `next` | In a `while`, a `for…of` or a counted `for`, without a label. |
| `return`, `return value`, `return {…}` | `return` | Leaves the Flow. Refused inside a loop (`FLOWSCRIPT_V3_RETURN_IN_LOOP`). |
| `throw { code: "LITERAL", message }` | `throw` | `code` is a literal public code. |
<!-- /fragment -->

```flowscript id=open-labels
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

<!-- fragment:nested-loops -->
**Nested loops.** Locals declared in a loop body remain available in nested loops. When an inner `for…of`, a list
method arrow, or a `flow.forEach`/`list.*` call rebinds `current` and reads the outer `for…of` item, the reader
automatically copies that item to `local.<name>` at the start of the outer body. Destructured fields are already
copied from `current.<field>` there. Other reads of the item continue to use `current`.
<!-- /fragment -->

## 6. Expressions

The v2 expression subset is unchanged: scope paths, literals, arrays, objects, template literals, `+ - * / %`,
`== != === !==` (`===` strict), `< <= > >=`, `&& || !`, `?:`, `??`, `typeof`, `value[key]`, the pure functions
(`Math.*`, `Number`, `String`, `parseInt`…) and the text, list and number methods of the v2 guide.

- `?.` is accepted and means `.`: paths are already null-safe.
- Write JavaScript methods: `name.toLowerCase()`, `text.includes(part)`, `list.length`, a template literal or `+`.
  The v2 functions (`lower`, `upper`, `trim`, `contains`, `length`, `json`) remain valid but differ on `null`
  (`lower(null)` is `""`), so sources are not rewritten.
- `??` keeps `0`, `false` and `""`; `||` replaces them. `flow.default(a, b)` replaces `null`, `undefined` and `""`, in
  any expression. A bare `default(a, b)` is not JavaScript (`default` is a reserved word): it is refused
  (`FLOWSCRIPT_V3_RESERVED_WORD`) with the rewrite `flow.default(a, b)`.
- A regular expression literal is a block: `text.match`, `text.replace`, `text.split` (as in v2).

## 7. List methods

```flowscript id=list-methods
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

<!-- fragment:list-table -->
| JavaScript | Block |
|---|---|
| `xs.filter(x => c)` | `list.filter({ items: xs, where: c })`, `x` read as `current` |
| `xs.map(x => e)` | `list.map({ items: xs, select: e })`; an object literal is written `x => ({ … })` |
| `xs.find(x => c)` | `list.find({ items: xs, where: c })`: `undefined` when nothing matches |
| `xs.some(x => c)`, `xs.every(x => c)` | `list.some`, `list.every` |
| `xs.toSorted((a, b) => a.k - b.k)`, `[...xs].sort(…)` | `list.sort({ items: xs, by: current.k, compare: "number" })`; `b.k - a.k` adds `direction: "desc"` |
| `xs.toSorted((a, b) => a.k.localeCompare(b.k))` | `list.sort({ items: xs, by: current.k, compare: "locale" })`; `b.k.localeCompare(a.k)` adds `direction: "desc"` |
| `xs.toSorted((a, b) => a - b)` | `list.sort({ items: xs, compare: "number" })`; `b - a` adds `direction: "desc"` |
| `xs.toSorted((a, b) => a.localeCompare(b))`, also with `String(a)` and `String(b)` | `list.sort({ items: xs, compare: "locale" })`; reversed operands add `direction: "desc"` |
| `xs.toSorted((a, b) => a.k < b.k ? -1 : (a.k > b.k ? 1 : 0))` and its exact spellings | `list.sort({ items: xs, by: current.k, compare: "natural" })`: `left < right ? -1 : left > right ? 1 : 0` on the raw keys; `b` first adds `direction: "desc"` |
| `xs.toSorted((a, b) => c1 \|\| c2 \|\| …)`, each `ci` one of the comparators above | `list.sort` with the first key and `then: [{ by, compare, direction }, …]`; a `0` or `NaN` falls to the next key, as `\|\|` does |
| `includes`, `slice`, `join`, `at`, `indexOf`, `length` | expression methods, no block |
| `xs.concat(ys)` | the expression method `Array.prototype.concat`: a copy of `xs` followed by the items of `ys` (a non-list argument is appended as one item); a list method chain in an argument runs before it |
<!-- /fragment -->

<!-- fragment:list-rules -->
- The function is an arrow with one parameter and an expression body without block call. `function (x) { return e }`
  is the same.
- A method is written in an assignment or a `return`. Methods chain: each block method becomes a node whose result
  feeds the next step through a hidden local `local.__chain<N>`.
- A declaration or an assignment that is entirely `cond ? branch1 : branch2` may hold a chain in a branch: it is lowered to
  `if (cond) { x = branch1 } else { x = branch2 }`. The condition of an `if` may hold a chain that it always
  evaluates: it runs before the `if`.
- Refused, with a rewrite into two `const` (`FLOWSCRIPT_V3_CHAIN`): a step inside a branch of `&&`, `||` or `??`, or of
  a `?:` that is not the whole statement; a step in an argument of an expression function; a step after a scope read of
  the same statement; a step in a `while` condition.
- Sorting keeps the JavaScript comparator: `compare: "number"` orders by `a - b`, `compare: "locale"` by
  `String(a).localeCompare(String(b))` and `compare: "natural"` by `a < b ? -1 : a > b ? 1 : 0` (the JavaScript `<` on
  the raw keys), on a copy sorted by the engine's `Array.prototype.sort`, exactly as the
  arrow does: the sort is stable, and an absent key gives `NaN`, which the comparator treats as equal. With
  `compare: "locale"`, an absent key compares as the text `"undefined"`: this is the meaning of
  `String(a.k).localeCompare(String(b.k))`, while `a.k.localeCompare(b.k)` would fail in JavaScript; both forms
  give that `list.sort` (paths are null-safe). Without `compare`,
  `list.sort` keeps its Flow order (numeric texts as numbers, `null` as `""`), which no JavaScript comparator
  reproduces: it stays a call.
- Refused: `xs.sort(…)` alone (it sorts in place, `list.sort` returns a copy: write `toSorted`), a comparator that is not an accepted key comparator,
  `reduce`, an index parameter `(x, i)`, a parameter of an outer arrow read in an inner one
  (`FLOWSCRIPT_V3_LIST_METHOD`).
<!-- /fragment -->

## 8. Typed collections

<!-- fragment:collections -->
- A list or a map is created typed: `const rows = json.array({ itemType: {…} })`, `const byId = json.map({ valueType: {…} })`.
- `rows.push(v)` is `json.push({ path: "local.rows", value: v })`; `byId[key] = v` is `json.put({ path: "local.byId", key, value: v })`;
  `order.status = "paid"` is a `set`, as in v2.
- `const rows = []` (or `let`) followed by `push` lowers to the `json.array` whose item type every pushed value proves
  from its syntax (text, number and boolean literals, comparisons, `null`, object and list literals); a pushed name,
  path, call or computed number is refused (`FLOWSCRIPT_V3_UNTYPED_LIST`) with the exact `json.array({ itemType })` to
  write as its proposal.
<!-- /fragment -->

## 9. Global functions

In an assignment, a `return`, at the head of a chain, as the list of a `for…of`, or in the condition of an `if` (section
15):

<!-- fragment:globals -->
| JavaScript | Block |
|---|---|
| `Object.keys(o)`, `Object.values(o)` | `object.keys({ source: o })`, `object.values({ source: o })` |
| `JSON.parse(t)` | `json.parse({ text: t })` |
| `JSON.stringify(v)`, `JSON.stringify(v, null, 2)` | `json.stringify({ value: v })`, with `pretty: true` |

- Elsewhere, and with other arguments (replacer, reviver, other indent), they are refused (`FLOWSCRIPT_V3_GLOBAL_CALL`).
- `Object.entries` is refused: `for (const key of Object.keys(o)) { const value = o[key] … }`.
- `Date.now()` and `new Date()` are refused: use `date.now`, `date.format`… (time zone and format).
- `JSON.*` and `Object.*` remain refused inside other expressions, as in v2.
<!-- /fragment -->

## 10. Errors

```flowscript id=notify
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

<!-- fragment:errors -->
- `throw { code: "LITERAL", message, details, status }` raises an application error, as in v2.
- `throw e`, where `e` is the parameter of the enclosing `catch` and is not assigned, raises the caught error
  unchanged: same code, message, details and status; an application error stays one (answered 200 with its
  envelope), a failure of the Flow stays a failure (500). It is `throw({ error: "local.e" })`: the `try` keeps the
  caught error, hidden, on the value of its error local. `throw` of another name is refused (`FLOWSCRIPT_V3_UNSUPPORTED`),
  and so is a thrown object with an `error` field, the name of that block property.
- In `catch (e)`, `e.code` and `e.message` are those of the caught error, and `e.details` the details of the thrown
  error, as in JavaScript: `undefined` when it has none.
- `throw new Error(m)` is refused (`FLOWSCRIPT_V3_ERROR_CODE_CHOICE`). The public code is a choice:
  the proposal is `throw { code: "CHOOSE_ERROR_CODE", message: m }`.
<!-- /fragment -->

## 11. Call forms

<!-- fragment:call-forms -->
- Every block is called with one object of named properties: `sql.query({ connection, sql })`.
- A control block whose properties go beyond its JavaScript form keeps its call form, prefixed with `flow.`:
  `flow.while({ condition: …, maxIterations: 100000, $$nodes() { … } })`, `flow.forEach`, `flow.if`, `flow.try`.
  Its slots keep the v2 keys (`$$then`, `$$else`, `$$nodes`, `$$try`, `$$catch`). A slot is written as a method
  (`$$nodes() { … }`), a function (`$$nodes: function () { … }`) or an arrow with a block body (`$$nodes: () => { … }`),
  without parameter. A call with a slot that is declared, assigned or returned (`const tx = sql.transaction({ …,
  $$nodes() { … } })`) writes its output with `$$out`.
- `$$id`, `$$out`, `$$disabled` and `$$comment` stay engine attributes of a call.
<!-- /fragment -->

## 12. Names, comments and disabled statements

<!-- fragment:names -->
- A JavaScript label gives an explicit node name: `checkStock: if (…) { … }`. Without a label, names are computed.
- A comment directly above a statement, without a blank line, is its comment; a `/* … */` comment is read the same
  way, and the formatter writes it as `//` lines. Separated by a blank line, it is
  a standalone comment node.
- `// @disabled` in that comment disables the statement.
<!-- /fragment -->

## 13. Refused constructs

| Construct | Code | Rewrite |
|---|---|---|
| `break` | `FLOWSCRIPT_V3_BREAK` | a local tested by the `while` condition, or `find` / `filter` |
| `default(x, y)` (a reserved word, not a function) | `FLOWSCRIPT_V3_RESERVED_WORD` | `flow.default(x, y)` |
| `finally` | `FLOWSCRIPT_V3_FINALLY` | the statements after the `try` |
| `return` inside a loop | `FLOWSCRIPT_V3_RETURN_IN_LOOP` | `continue`, or a local and a `return` after the loop |
| a `for (;;)` other than the counted form | `FLOWSCRIPT_V3_FOR_FORM` | `for…of` or `while` |
| `switch` with fall-through or non-literal cases | `FLOWSCRIPT_V3_SWITCH_FALLTHROUGH` | `if` / `else if` |
| `do … while`, `for … in`, labelled loops, labelled `break` / `continue` | `FLOWSCRIPT_V3_LOOP_FORM` | `while`, `for (const key of Object.keys(o))` |
| a function other than a top-level helper, a list arrow or a slot (nested, in an expression, a closure) | `FLOWSCRIPT_V3_FUNCTION` | write it inline, a top-level helper, or a project block |
| `async`, `await`, generators, classes, `this`, `new` | `FLOWSCRIPT_V3_UNSUPPORTED` | blocks |
| `if` or `while` whose condition is an object literal | `FLOWSCRIPT_V3_OBJECT_CONDITION` | `flow.if({ … })` |

```flowscript refused=FLOWSCRIPT_V3_BREAK id=refused-break
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

```flowscript refused=FLOWSCRIPT_V3_ERROR_CODE_CHOICE id=refused-error-code
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

<!-- fragment:rendering-natural -->
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
| `list.sort` with `compare` | `items.toSorted((a, b) => a.k - b.k)`, `… localeCompare …`, `a.k < b.k ? -1 : a.k > b.k ? 1 : 0`; `then` keys joined by `\|\|` |
| `json.push`, `json.put` | `local.rows.push(v)`, `local.byId[key] = v` |
| `object.keys`, `object.values`, `json.parse`, `json.stringify` | `Object.keys(o)`, `Object.values(o)`, `JSON.parse(t)`, `JSON.stringify(v)` / `JSON.stringify(v, null, 2)` |
| a disabled statement | its natural form with `// @disabled` in its comment |
<!-- /fragment -->

<!-- fragment:rendering-names -->
**Names.** The variable of a `for…of` and the parameter of a list arrow are `item`; when that name is visible
already, the first free of `item2`, `item3`… The parameter of `catch` is the name of the error local
(`error: "local.failure"` gives `catch (failure)`).
<!-- /fragment -->

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

**Call details.** The four control blocks are written `flow.while`, `flow.forEach`, `flow.if` and `flow.try`; the other
blocks keep their name. An assignment writes the output of a call (`local.rows = sql.query({ … })`) and leaves out the
destination it fills (`json.array`, `json.map`); a call with slots keeps its output as `$$out`, since an assignment holds
no slot function. The v2 function `default(x, y)` is written `flow.default(x, y)` (section 15).

**The guard.** A rendering is kept only when reading it back gives the same definition (the `comparable` of the code
tools: implicit names and `__flowScript*` fields left out). Three things are not part of that comparison: blank lines,
a property equal to the value the runtime reads when it is absent (`while` bounds 1000 and 60000, `try` error
`local.error`, `return` value `${result}`, `list.sort` direction `asc`), and the hidden locals `local.__chain<N>`, which
are folded into the assignment that only copies them and numbered in order. A natural form whose reading differs is
written in its call form; when even the call forms read back differently, the rendering is refused
(`FLOWSCRIPT_V3_RENDER_CHANGED_PROGRAM`) and nothing is written.

## 15. Changes after the L6 bench (L0′, 18/11/2026)

The L6 bench (v3 form B against v2, ML4, Opus and gpt-6-sol, 120/120 cases in both arms) showed 15 refusals of common
JavaScript forms. Each one below becomes accepted, with the exact JavaScript meaning, or keeps a refusal that names the
replacement. The rules of the previous sections are amended accordingly.

1. **Relational comparators.** `xs.toSorted((a, b) => a.k < b.k ? -1 : (a.k > b.k ? 1 : 0))` and its symmetric
   spellings (`>` first, `<=`/`>=` with an equality middle, `b` before `a` for descending) lower to
   `list.sort({ items: xs, by: current.k, compare: "natural" })`. `compare: "natural"` sorts a copy with the engine's
   `Array.prototype.sort` and that very comparator: `left < right ? -1 : left > right ? 1 : 0` on the raw keys. The
   identity form (`a < b ? -1 : …`) sorts by the items themselves. *Exact spellings*: a ternary of `<`, `>`, `<=`, `>=`,
   `==`, `!=`, `===`, `!==` tests between the two keys, with number results, is accepted when it gives the sign of that
   comparator (or of its reverse) for every pair of keys. Each test is decided by the class of the pair: less, greater,
   or neither, the last with `===`, with `==` only or with neither, for comparable keys and for incomparable ones
   (`NaN`, `undefined`); the reader checks the eight classes. `a.k === b.k ? 0 : a.k > b.k ? 1 : -1` or
   `a.k < b.k ? -1 : 1` differ on an incomparable or loosely equal pair and stay refused (`FLOWSCRIPT_V3_LIST_METHOD`).
2. **Several keys.** A comparator written `c1 || c2 || …`, where each `ci` is an accepted key comparator (`a.k - b.k`,
   `localeCompare`, relational), lowers to `list.sort` with the first key and `then: [{ by, compare, direction }, …]`
   for the next ones. The block evaluates `c1(a, b) || c2(a, b) || …` literally, so a `0` or `NaN` falls to the next
   key, exactly as `||` does.
3. **`flow.default(x, y)`, not `default(x, y)`.** `default` is a reserved word of JavaScript: a bare `default(` outside
   a `switch` is not JavaScript, so it stays refused (`FLOWSCRIPT_V3_RESERVED_WORD`) with the exact rewrite
   `flow.default(x, y)` as its proposal, which the MCP may apply as a correction. `flow.default(x, y)` is valid
   JavaScript and keeps exactly the meaning of the v2 `default` function, in any expression. The migrator rewrites
   v2 `default(` to `flow.default(`; it writes `x ?? y` only where the meaning is proven identical (the v2 function may
   treat `""` as absent). The guides teach `x ?? y` first.
4. **Untyped lists.** `const rows = []` (or `let`) followed by `rows.push(v)` is accepted. If `json.array` accepts an
   item type that admits any value, the declaration lowers to that type, which is the JavaScript meaning. Otherwise the
   reader infers the item type from every `push` of the Flow, and refuses with the exact `json.array({ itemType })`
   proposal when the pushes disagree or cannot be typed. *Implementation (L0′)*: `json.array` admits no such type
   (`unknown` is missing evidence, refused with `UNKNOWN_VALUE_TYPE`; there is no `any`). A value is typed from its
   syntax alone, so that every run accepts it: text and template literals (`string`), finite number literals (`integer`,
   `number`), `true`/`false`, comparisons, `!` (`boolean`), `typeof` (`string`), `null` (`nullable`), object literals
   (`object`, whose fields of certain type become `properties`, the others unchecked), list literals, and `c ? a : b`.
   A later `rows = []` or list literal joins the inference. A name, a path, a call or arithmetic (whose `NaN` no type
   accepts) is refused at its line; the proposal is the `json.array` with the type proven by the other values
   (`{ type: "number" }` for arithmetic), or `{ type: "CHOOSE_TYPE" }` when none or when they disagree.
5. **`continue` in a counted `for`.** `for (let i = a; i < b; i++) { … continue … }` is accepted. *Implementation
   (L0′)*: no range block is needed. The loop lowers with existing blocks to `local.__count<N> = a`, then
   `while (local.__count<N> < b) { local.i = local.__count<N>; local.__count<N> = Number(local.__count<N>) + 1; … }`,
   where `continue` is `next`: the counter steps before the body, so the test sees `i + 1` whether the pass ends early
   or not, and `b` is read at every test as in JavaScript. The bound may therefore change in the body; the loop visits
   the values of the range `[a, b)` (or `[a, b]` for `<=`) when it does not. Assigning `i` in the body stays refused
   (`FLOWSCRIPT_V3_FOR_FORM`, proposal: a `while` with a local the body changes).
6. **A list method in a branch of `?:`.** When a declaration or an assignment is entirely `cond ? branch1 : branch2`
   and a branch holds a list method chain, it lowers to `if (cond) { x = branch1 } else { x = branch2 }`, each chain
   lowered inside its branch. Other lazy positions keep `FLOWSCRIPT_V3_CHAIN` until the nested-call unroller
   (study of 18/11, postponed). *Implementation (L0′)*: the same holds for a field of a returned object literal (the
   assignment of `result.x`) and for a global call lowered to a block (`Object.keys`, `JSON.parse`…) in a branch; a
   nested `?:` in a branch is lowered the same way inside that branch; a step in the test of `?:` stays refused.
7. **`xs.concat(ys)`.** It is accepted as a statement-level list method: a copy of `xs` followed by the items of `ys`
   (`ys` a list; a non-list argument is appended as one item, as in JavaScript). It stays the expression method
   (`Array.prototype.concat`); a list method chain in an argument runs before it, after the chain of `xs`, which is the
   JavaScript order since list arrows have no effect.
8. **`const` scope in Rhino 1.9.2.** Its parser gives a `const` the scope of its whole function: a `const agg` in a loop
   body followed by `for (const agg of rows)` (line 91 of the L3 bench source), or two sibling blocks declaring the same
   `const`, failed to parse (`FLOWSCRIPT_V3_UNSUPPORTED`). The preparation now writes each `const` declaration keyword
   as `let`, same length (section 1); the `const` rules come from the source text. A `const` without a value is not
   JavaScript and is refused (`FLOWSCRIPT_V3_UNSUPPORTED`).
9. **`x++` on a text.** `x++` and the step of a counted `for` add 1 to `Number(x)`, as JavaScript does; `x + 1` joined a
   numeric text (`"1"` gave `"11"`).
10. **L0′bis (control bench it67v3c, 18/11/2026).**
   - *`for…of` over a global call or a chain.* `for (const key of Object.keys(o))`, `Object.values(o)`, or a list method
     chain (`filter`, `map`, `toSorted`, `sort`, `concat`) as the iterated list: the list is computed once, before the
     loop, in a hidden local `local.__chain<N>`, as JavaScript evaluates the iterated expression once (keys added to
     `o` in the body are not visited).
   - *Slots.* A slot accepts the three writings of section 11 wherever a slot exists, including a call that is
     declared, assigned or returned (`$$out`). An arrow with an expression body or a slot with a parameter is refused
     (`FLOWSCRIPT_V3_FUNCTION`) with the three writings as the proposal.
   - *List method in an `if` condition.* The condition of an `if` is evaluated once, whole: each list method or global
     call it always evaluates runs before the `if`, in a hidden local (`if (!roles.some(r => r == "OWNER"))`), an
     `else if` condition inside its `else`. Not in the right operand of `&&`, `||`, `??`, a branch of `?:`, an argument
     of a call, or an arrow (`FLOWSCRIPT_V3_CHAIN`). A `while` condition is evaluated before every pass: a list method
     there stays refused (`FLOWSCRIPT_V3_CHAIN`), with a `let` computed before the loop and at the end of the body as the
     proposal.
   - *Field updates.* `o.count++`, `o.count--` and `o.total += x` change a field of a local object or of `result`. An
     object read from a map or a list is that object in the Flow as in JavaScript, so `const g = byCat[c]; g.count++`
     changes the map (tested against Node). A field of a loop item or of `input` stays refused (`FLOWSCRIPT_V3_UNSUPPORTED` for `++` and `--`; the v2 check
     `FLOWSCRIPT_WRITE_SCOPE_UNSUPPORTED` for `+=`).
   - *Conditional expression end.* An `if` whose condition is a `?:` emitted one closing parenthesis too many (Rhino
     1.9.2 extends the expression over the `)` that follows it, as for an infix expression): fixed.
11. **L1b: rethrow and `catch` without parameter (18/11/2026).** `throw e` in the `catch (e)` that caught it lowers to
   `throw({ error: "local.e" })`. The `throw` block has an optional `error` property, the path of a try's error local:
   it raises the error the `try` caught again, as it is. The `try` keeps that error on the value it writes, in a property
   that is not enumerable (never in a result, a trace or a comparison), so the error keeps its code, message, details,
   status, extra fields and its application mark: an application error answers 200 with its envelope, a failure of the
   Flow 500 (tested through the HTTP requester). A path without a caught error gives `FLOW_THROW_NOT_CAUGHT` (500).
   `catch { … }` declares no name (Rhino 1.9.2 cannot visit it: the reader visits its body itself); the error goes to
   `local.error`, or to a hidden `local.__caught<N>` when the Flow has its own `error`, which the `try` must not
   overwrite. The renderer writes a `throw` with only `error`, in the catch whose parameter holds it, as `throw e`.
12. **Java reader (18/11/2026).** The engine reads `sourceVersion: 3` with the Java reader
   `com.convertigo.libflowengine.FlowScriptV3Reader` (in the code tools, the rendering guard and the migration), which
   builds the Flow definition from the Rhino AST directly. The prototype bridge (v3 text lowered to v2 text, then the v2
   parser) is frozen: it is only the oracle of the tests. The differential test gives the same definition, or the same
   refusal (code and line), on every source of its corpus: the examples of this specification and of the grammar, the
   rendering cases, the guides, the bench revisions and probes of the forms below. The bridge reads three forms wrong,
   and the reader keeps their JavaScript meaning (tested against Node): a shorthand field in the object pushed into a
   list or put into a map (`rows.push({ category, cents })`), a global call as the receiver of a list method
   (`Object.values(o).toSorted(…)`, computed before, in a hidden local), and a `//` comment on a line of an expression
   written on several lines (ignored). Readings aligned at the integration:
   - a declared name is bound after its value is read (`let y = y + 1` is refused, `FLOWSCRIPT_V3_OUT_OF_SCOPE`), and a
     `const` without value is refused (`FLOWSCRIPT_V3_UNSUPPORTED`), as in JavaScript;
   - the statements of a `case` share one scope; a `switch` value or a destructured declaration is read as an
     expression (a call with a slot, or a `?:` with a block step in a branch, stays refused there);
   - a slot (a function under a `$$` name) on a block that does not declare it is refused
     (`FLOW_SOURCE_ENGINE_ATTRIBUTE_UNKNOWN`: its body would never run), and so is an assignment of a call whose `$$out`
     names another destination (`FLOW_SOURCE_OUTPUT_CONFLICT`), as the v2 parser does; a refusal of the subset, wherever
     it stands, comes first;
   - Rhino 1.9.2 counts the character after a keyword literal in it (`c ? a : null,`): the expression ends at the
     keyword;
   - an expression written on several lines is one line (each line trimmed, the lines joined by a space), as the v2
     reading joins them; a signed number written without space (`-1`, `+1`, `-1.5`) is that number in a value and in a
     block property, not the expression `${-1}`;
   - a quoted text is text, as in JavaScript: in a value its `${` is escaped (`"cost ${x}"` is those characters), in a
     template property it is refused (`FLOWSCRIPT_QUOTED_TEMPLATE`: it would not interpolate), a fixed property
     (`literal`, `select`…) takes it as written. The reader gave `${x}` to the Flow template, which read it as an
     expression;
   - comments and blank lines: a blank line after comments makes them a comment node, and a statement after a blank
     line keeps it for the rendering; the comments that end a block are a comment node; `@disabled` is removed from
     the comment of the statement it disables.
   In `catch (e)`, `e.details` is now the details of the thrown error (section 10); it was `undefined`. The other
   fields of the caught error are unchanged.
