// FlowScript v3 forms of the L6 bench (specification section 15): each accepted form is translated by the bridge, run by
// the engine and compared with Node running the same JavaScript; each remaining refusal names its rule and replacement.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-v3-bench-forms-").toFile().getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var bridge = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/flowscript-v3-prototype.js"), "UTF-8")));
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }
function check(ok, message) { if (!ok) throw new Error(message); }
function program(body, inputs) {
	return 'const _flow = { sourceVersion: 3' + (inputs ? ', inputs: ' + inputs : '') + ' }\nfunction Example({ input, config, result }) {\n' + body + '\n}';
}
// Node runs the source itself: the Flow function is JavaScript; flow.default is the v2 default function and a typed
// collection is a JavaScript list or object. A Flow that writes result fields gives its result object.
function node(code, input) {
	var script = 'const flow = { default: (value, fallback) => value === undefined || value === null || value === "" ? fallback : value };\n' +
		'const json = { array: () => [], map: () => ({}) };\n' + code.replace(/^const _flow = [^\n]*\n/, '') +
		'\nconst args = { input: JSON.parse(process.argv[1]), config: {}, result: {} };\nconst value = ' + /function\s+([\w$]+)/.exec(code)[1] + '(args);\n' +
		'process.stdout.write(JSON.stringify(value === undefined ? args.result : value));';
	var command = new java.util.ArrayList();
	['node', '-e', script, JSON.stringify(input)].forEach(function (part) { command.add(new java.lang.String(String(part))); });
	var process = new java.lang.ProcessBuilder(command).redirectErrorStream(true).start();
	var reader = new java.io.BufferedReader(new java.io.InputStreamReader(process.getInputStream(), 'UTF-8'));
	var output = '', part;
	while ((part = reader.readLine()) !== null) output += String(part);
	check(process.waitFor() === 0, 'Node: ' + output + '\n' + script);
	return output;
}
function translated(label, code, pattern) {
	var lowered = bridge.translate(code);
	check(!lowered.diagnostics.length, label + ' bridge: ' + JSON.stringify(lowered.diagnostics));
	if (pattern) check(pattern.test(lowered.code), label + ' lowering: ' + lowered.code);
	return lowered;
}
function flowResult(label, code, input, lowered) {
	var validation = api('flowSourceValidate', { name: 'Example', code: code });
	check(validation.ok, label + ' validation: ' + JSON.stringify(validation).substring(0, 1200) + '\n' + lowered.code);
	var run = api('flowCodeRun', { name: 'Example', code: code, input: input, includeTrace: false });
	check(run.ok, label + ' run: ' + JSON.stringify(run).substring(0, 1200) + '\n' + lowered.code);
	return JSON.stringify(run.result);
}
// The Flow gives what Node gives on the same source, and, when given, the expected value.
function same(label, body, input, expected, pattern, inputs) {
	var code = program(body, inputs), lowered = translated(label, code, pattern);
	var flow = flowResult(label, code, input, lowered), javascript = node(code, input);
	check(flow === javascript, label + ': Flow ' + flow + ' but JavaScript ' + javascript + '\n' + lowered.code);
	if (expected !== undefined) check(flow === JSON.stringify(expected), label + ': ' + flow + ' instead of ' + JSON.stringify(expected));
	return flow;
}
function refuses(label, body, code, line, hint) {
	var result = bridge.translate(program(body));
	var diagnostic = result.diagnostics[0] || {};
	check(diagnostic.code === code && diagnostic.line === line, label + ': ' + JSON.stringify(result));
	check(diagnostic.message.indexOf(code + ' at line') !== 0 && diagnostic.hint, label + ' needs a rule and a replacement: ' + JSON.stringify(diagnostic));
	if (hint) check(diagnostic.hint.indexOf(hint) >= 0, label + ' proposal: ' + diagnostic.hint + ' (expected ' + hint + ')');
	return diagnostic;
}
function parser() {
	var environment = new Packages.org.mozilla.javascript.CompilerEnvirons();
	environment.setLanguageVersion(200); environment.setRecoverFromErrors(false);
	return new Packages.org.mozilla.javascript.Parser(environment);
}
var cases = 0;

// 1 and 2. Relational comparators and several keys, compared with Node on the same data: mixed keys (numbers, numeric
// texts, texts, booleans, null, absent), ties, NaN keys and several keys.
var mixed = [{ id: 'a', k: 10, n: 1 }, { id: 'b', k: '9', n: 2 }, { id: 'c', k: 9, n: 3 }, { id: 'd', k: '10', n: 1 }, { id: 'e', n: 2 },
	{ id: 'f', k: null, n: 3 }, { id: 'g', k: 'abc', n: 1 }, { id: 'h', k: 'Abc', n: 2 }, { id: 'i', k: true, n: 3 }, { id: 'j', k: 10, n: 2 },
	{ id: 'k', k: '', n: 1 }, { id: 'l', k: '9', n: 3 }, { id: 'm', k: 'Éclair', n: 1 }, { id: 'o', k: 'eclair', n: 2 }];
var sums = [{ category: 'tools', sumCents: 1200 }, { category: 'food', sumCents: 550 }, { category: 'books', sumCents: 1200 },
	{ category: 'garden', sumCents: 80 }, { category: 'art', sumCents: 550 }];
function sortSame(label, comparator, items, pattern, keys) {
	cases++;
	var scalars = typeof items[0] !== 'object';
	same(label, '  const sorted = input.items' + (keys || '') + '.toSorted(' + comparator + ')\n  return { sorted' + (scalars ? '' : ': sorted.map(row => row.id)') + ' }',
		{ items: items }, undefined, pattern);
}
var natural = /compare: "natural"/;
sortSame('bench relational', '(a, b) => a.label < b.label ? -1 : (a.label > b.label ? 1 : 0)',
	[{ id: 1, label: 'b' }, { id: 2, label: 'a' }, { id: 3, label: 'B' }, { id: 4 }, { id: 5, label: 'a' }, { id: 6, label: 10 }, { id: 7, label: '9' }], natural);
sortSame('relational mixed keys', '(a, b) => a.k < b.k ? -1 : a.k > b.k ? 1 : 0', mixed, /by: current\.k, compare: "natural", direction: "asc"/);
sortSame('relational greater first', '(a, b) => a.k > b.k ? 1 : a.k < b.k ? -1 : 0', mixed, natural);
sortSame('relational mirrored test', '(a, b) => a.k < b.k ? -1 : b.k < a.k ? 1 : 0', mixed, natural);
sortSame('relational descending', '(a, b) => b.k < a.k ? -1 : (b.k > a.k ? 1 : 0)', mixed, /compare: "natural", direction: "desc"/);
sortSame('relational descending greater first', '(a, b) => a.k > b.k ? -1 : a.k < b.k ? 1 : 0', mixed, /direction: "desc"/);
sortSame('relational lower or equal', '(a, b) => a.k <= b.k ? (a.k < b.k ? -1 : 0) : (a.k > b.k ? 1 : 0)', mixed, natural);
sortSame('relational greater or equal', '(a, b) => a.k >= b.k ? (b.k < a.k ? 1 : 0) : (a.k < b.k ? -1 : 0)', mixed, natural);
sortSame('relational block body and magnitudes', '(a, b) => { return a.k < b.k ? -2 : a.k > b.k ? 5 : 0 }', mixed, natural);
sortSame('relational nested path', '(a, b) => a.p.q < b.p.q ? -1 : a.p.q > b.p.q ? 1 : 0',
	[{ id: 1, p: { q: 'b' } }, { id: 2, p: { q: 'a' } }, { id: 3, p: { q: 'a' } }, { id: 4, p: {} }], /by: current\.p\.q/);
sortSame('relational identity', '(a, b) => a < b ? -1 : a > b ? 1 : 0', [10, 9, '10', '9', 'b', 'a', true, null, 9, '', 'B'],
	/list\.sort\(\{ items: input\.items, compare: "natural", direction: "asc" \}\)/);
sortSame('relational identity descending', '(a, b) => b < a ? -1 : b > a ? 1 : 0', [10, 9, '10', 'b', 'a', 9], /direction: "desc"/);
sortSame('relational NaN keys', '(a, b) => a.k < b.k ? -1 : a.k > b.k ? 1 : 0',
	[{ id: 'a', k: 'x' }, { id: 'b', k: 3 }, { id: 'c' }, { id: 'd', k: '1' }, { id: 'e', k: null }, { id: 'f', k: 2 }, { id: 'g', k: 'y' }, { id: 'h', k: 1 }],
	natural, '.map(row => ({ id: row.id, k: row.k * 1 }))');
sortSame('bench several keys', '(a, b) => (b.sumCents - a.sumCents) || a.category.localeCompare(b.category)', sums.map(function (row) {
	return { id: row.category, category: row.category, sumCents: row.sumCents };
}), /by: current\.sumCents, compare: "number", direction: "desc", then: \[\{ by: current\.category, compare: "locale", direction: "asc" \}\]/);
sortSame('several keys without parentheses', '(a, b) => b.n - a.n || a.id.localeCompare(b.id)', mixed, /then: \[/);
sortSame('several keys NaN falls through', '(a, b) => (a.k - b.k) || (a.n - b.n) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)', mixed,
	/then: \[\{ by: current\.n, compare: "number", direction: "asc" \}, \{ by: current\.id, compare: "natural", direction: "asc" \}\]/);
sortSame('several keys relational first', '(a, b) => (b.k < a.k ? -1 : b.k > a.k ? 1 : 0) || String(b.id).localeCompare(String(a.id))', mixed,
	/compare: "natural", direction: "desc", then: \[\{ by: current\.id, compare: "locale", direction: "desc" \}\]/);
sortSame('several keys on NaN', '(a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0) || (b.n - a.n)',
	[{ id: 'a', k: 'x', n: 1 }, { id: 'b', k: 3, n: 2 }, { id: 'c', n: 3 }, { id: 'd', k: '1', n: 1 }, { id: 'e', k: 'y', n: 5 }, { id: 'f', k: 1, n: 2 }],
	/then: \[/, '.map(row => ({ id: row.id, k: row.k * 1, n: row.n }))');
// The same block, written as a v2 call: then entries are read per item, and a then entry must name a known comparator.
var thenRun = api('flowCodeRun', { name: 'Then', includeTrace: false, input: {},
	code: 'const _flow = { sourceVersion: 2 }\nfunction Then({ input, config, result }) {\n  local.rows = list.sort({ items: [{ g: "b", n: 1 }, { g: "a", n: 2 }, { g: "a", n: 1 }], by: current.g, compare: "locale", then: [{ by: current.n, compare: "number", direction: "desc" }] })\n  result.rows = local.rows\n}' });
check(thenRun.ok && JSON.stringify(thenRun.result.rows) === JSON.stringify([{ g: 'a', n: 2 }, { g: 'a', n: 1 }, { g: 'b', n: 1 }]), 'v2 then: ' + JSON.stringify(thenRun).substring(0, 800));
var thenInvalid = api('flowCodeRun', { name: 'ThenInvalid', includeTrace: false, input: {},
	code: 'const _flow = { sourceVersion: 2 }\nfunction ThenInvalid({ input, config, result }) {\n  local.rows = list.sort({ items: [2, 1], compare: "number", then: [{ compare: "numeric" }] })\n}' });
check(!thenInvalid.ok && thenInvalid.error.code === 'LIST_SORT_THEN_INVALID', 'unknown then comparator is refused: ' + JSON.stringify(thenInvalid).substring(0, 800));
// Comparators that are not exactly one of these orders stay refused, with the forms to write.
var comparatorHint = 'a.k < b.k ? -1 : a.k > b.k ? 1 : 0';
refuses('equality first comparator', '  const sorted = input.items.toSorted((a, b) => a.k === b.k ? 0 : a.k > b.k ? 1 : -1)', 'FLOWSCRIPT_V3_LIST_METHOD', 3, comparatorHint);
refuses('two-way comparator', '  const sorted = input.items.toSorted((a, b) => a.k < b.k ? -1 : 1)', 'FLOWSCRIPT_V3_LIST_METHOD', 3, comparatorHint);
refuses('lower or equal comparator', '  const sorted = input.items.toSorted((a, b) => a.k <= b.k ? -1 : 1)', 'FLOWSCRIPT_V3_LIST_METHOD', 3, comparatorHint);
refuses('two keys in one test', '  const sorted = input.items.toSorted((a, b) => a.k < b.j ? -1 : a.k > b.j ? 1 : 0)', 'FLOWSCRIPT_V3_LIST_METHOD', 3, comparatorHint);
refuses('other combination', '  const sorted = input.items.toSorted((a, b) => (a.k - b.k) && a.id.localeCompare(b.id))', 'FLOWSCRIPT_V3_LIST_METHOD', 3, '||');
// Why the equality-first spelling is refused: an absent key makes it differ from the relational comparator.
var equalityFirst = node(program('  return { ids: input.items.toSorted((a, b) => a.k === b.k ? 0 : a.k > b.k ? 1 : -1).map(row => row.id) }'), { items: [{ id: 'x', k: 1 }, { id: 'y' }] });
var relational = node(program('  return { ids: input.items.toSorted((a, b) => a.k < b.k ? -1 : a.k > b.k ? 1 : 0).map(row => row.id) }'), { items: [{ id: 'x', k: 1 }, { id: 'y' }] });
check(equalityFirst !== relational, 'the refused spelling has another meaning: ' + equalityFirst + ' ' + relational);

// 3. flow.default, not default: a bare default( is refused with its exact rewrite; flow.default keeps the v2 meaning.
refuses('bench bare default', '  const csv = default(input.csv, "")\n  return { csv }', 'FLOWSCRIPT_V3_RESERVED_WORD', 3, 'flow.default(input.csv, "")');
refuses('bare default in an expression', '  const n = 1 + default (input.n, (2))\n  return { n }', 'FLOWSCRIPT_V3_RESERVED_WORD', 3, 'flow.default(input.n, (2))');
[[{ csv: '' }, ''], [{ csv: null }, ''], [{ csv: 'a;b' }, 'a;b'], [{}, '']].forEach(function (pair, index) {
	cases++;
	same('flow.default ' + index, '  const csv = flow.default(input.csv, "")\n  return { csv }', pair[0], { csv: pair[1] }, /local\.csv = default\(input\.csv, ""\)/);
});
cases++;
same('flow.default in any expression', [
	'  const label = `[${flow.default(input.name, "anonymous")}]`',
	'  const names = input.rows.map(row => flow.default(row.name, "?"))',
	'  const kept = input.rows.filter(row => flow.default(row.name, "") != "")',
	'  const counts = []',
	'  for (const row of input.rows) {',
	'    if (flow.default(row.name, "") == "") {',
	'      continue',
	'    }',
	'    counts.push({ name: row.name, size: flow.default(row.size, 0) + 1 })',
	'  }',
	'  const mode = input.mode ? flow.default(input.mode, "x") : flow.default(input.other, "y")',
	'  return { label, names, kept: kept.length, counts, mode, nested: 2 * flow.default(input.missing, 3) }'
].join('\n'), { name: '', mode: '', rows: [{ name: 'a', size: 2 }, { name: '' }, { size: 4 }, { name: 'b' }] });

// 4. const rows = [] followed by push: the item type is proven by every push, or the declaration is refused.
cases++;
same('bench untyped list', [
	'  const rows = []',
	'  for (const item of input.items) {',
	'    if (item.amount > 1) {',
	'      rows.push({ id: item.id, label: `#${item.id}`, big: item.amount > 2, note: null })',
	'    } else {',
	'      rows.push({ id: item.id, label: "small", note: "x", tags: ["a", "b"] })',
	'    }',
	'  }',
	'  return { rows }'
].join('\n'), { items: [{ id: 1, amount: 3 }, { id: 2, amount: 1 }, { id: 3, amount: 2 }] }, undefined,
	/local\.rows = json\.array\(\{ itemType: \{ type: "object", properties: \{ label: \{ type: "string" \}, big: \{ type: "boolean" \}, note: \{ type: "string", nullable: true \}, tags: \{ type: "array", items: \{ type: "string" \} \} \} \} \}\)/);
cases++;
same('untyped list of scalars', [
	'  let numbers = []',
	'  numbers.push(1)',
	'  numbers.push(-2.5)',
	'  const texts = []',
	'  texts.push("a")',
	'  texts.push(`b${input.n}`)',
	'  texts.push(null)',
	'  const flags = []',
	'  flags.push(input.n > 1)',
	'  flags.push(!input.n)',
	'  if (input.n > 1) {',
	'    numbers = []',
	'    numbers.push(3)',
	'  }',
	'  return { numbers, texts, flags }'
].join('\n'), { n: 2 }, { numbers: [3], texts: ['a', 'b2', null], flags: [true, false] }, /itemType: \{ type: "number" \}[\s\S]*itemType: \{ type: "string", nullable: true \}[\s\S]*itemType: \{ type: "boolean" \}/);
cases++;
same('untyped list without push stays a list', '  let items = []\n  items = items.concat(input.items)\n  return { items }', { items: [1, 'a'] }, { items: [1, 'a'] }, /local\.items = \[\]/);
refuses('untyped list of unproven values', '  const rows = []\n  for (const item of input.items) {\n    rows.push(item)\n  }\n  return { rows }',
	'FLOWSCRIPT_V3_UNTYPED_LIST', 5, 'const rows = json.array({ itemType: { type: "CHOOSE_TYPE" } })');
refuses('untyped list partly proven', '  const rows = []\n  rows.push({ id: 1 })\n  rows.push(input.row)\n  return { rows }',
	'FLOWSCRIPT_V3_UNTYPED_LIST', 5, 'const rows = json.array({ itemType: { type: "object", properties: { id: { type: "integer" } } } }), if the value at line 5 has that type');
refuses('untyped list of different types', '  let rows = []\n  rows.push("a")\n  rows.push({ id: 1 })\n  return { rows }',
	'FLOWSCRIPT_V3_UNTYPED_LIST', 5, 'let rows = json.array({ itemType: { type: "CHOOSE_TYPE" } }); the pushed values have different types');
refuses('untyped list of computed numbers', '  const rows = []\n  for (const item of input.items) {\n    rows.push(item.price * item.quantity)\n  }\n  return { rows }',
	'FLOWSCRIPT_V3_UNTYPED_LIST', 5, 'const rows = json.array({ itemType: { type: "number" } }), if the value at line 5 has that type');
refuses('untyped list reassigned', '  let rows = []\n  rows.push(1)\n  rows = input.rows\n  return { rows }', 'FLOWSCRIPT_V3_UNTYPED_LIST', 5, 'json.array({ itemType: { type: "integer" } })');

// 5. continue in a counted for: the counter steps before the body, so continue leaves the pass as in JavaScript.
cases++;
same('bench counted continue', [
	'  let total = 0',
	'  const odd = json.array({ itemType: { type: "integer" } })',
	'  for (let i = 0; i < input.items.length; i++) {',
	'    if (input.items[i] % 2 == 0) {',
	'      continue',
	'    }',
	'    total += input.items[i]',
	'    odd.push(i)',
	'  }',
	'  return { total, odd }'
].join('\n'), { items: [1, 2, 3, 4, 5] }, { total: 9, odd: [0, 2, 4] }, /local\.__count1 = 0[\s\S]*local\.i = local\.__count1\nlocal\.__count1 = Number\(local\.__count1\) \+ 1/);
cases++;
same('counted continue with an upper bound changed in the body', [
	'  let n = 3',
	'  const seen = json.array({ itemType: { type: "number" } })',
	'  for (let i = 1; i <= n; i++) {',
	'    if (i == 1) {',
	'      n = 5',
	'      continue',
	'    }',
	'    seen.push(i * 10)',
	'  }',
	'  return { seen, n }'
].join('\n'), {}, { seen: [20, 30, 40, 50], n: 5 });
cases++;
same('counted continue from a text start', [
	'  const seen = []',
	'  for (let i = input.start; i < 4; i++) {',
	'    if (i == 2) {',
	'      continue',
	'    }',
	'    seen.push(`${typeof i}:${i}`)',
	'  }',
	'  let n = input.start',
	'  n++',
	'  return { seen, n }'
].join('\n'), { start: '1' }, { seen: ['string:1', 'number:3'], n: 2 });
cases++;
same('continue in loops nested in a counted for', [
	'  let total = 0',
	'  for (let i = 0; i < 3; i++) {',
	'    let j = 0',
	'    while (j < 3) {',
	'      j++',
	'      if (j == 2) {',
	'        continue',
	'      }',
	'      total += 1',
	'    }',
	'    for (const item of input.items) {',
	'      if (item == i) {',
	'        continue',
	'      }',
	'      total += 100',
	'    }',
	'  }',
	'  return { total }'
].join('\n'), { items: [0, 1] }, { total: 406 });
cases++;
same('counted for without continue', '  let total = 0\n  for (let i = 0; i < 4; i++) {\n    total += i\n  }\n  return { total }', {}, { total: 6 }, /local\.i = Number\(local\.i\) \+ 1/);
refuses('counted continue assigning the counter', '  for (let i = 0; i < 3; i++) {\n    if (i == 0) {\n      i = 2\n      continue\n    }\n  }', 'FLOWSCRIPT_V3_FOR_FORM', 5, 'while (i < end)');
refuses('counted step other than ++', '  for (let i = 0; i < 3; i += 1) {\n    continue\n  }', 'FLOWSCRIPT_V3_FOR_FORM', 3, 'for (let i = start; i < end; i++)');

// 6. A list method in a branch of ?:, when the declaration or assignment is the whole ternary: if / else.
cases++;
same('bench conditional find', [
	'  const posts = input.posts',
	'  const id = input.id ?? null',
	'  const post = id !== null ? posts.find(p => p.id === id) : undefined',
	'  return { post, found: post !== undefined }'
].join('\n'), { posts: [{ id: 1, t: 'a' }, { id: 2, t: 'b' }], id: 2 }, { post: { id: 2, t: 'b' }, found: true },
	/if \(local\.id !== null\) \{\nlocal\.__chain1 = list\.filter[\s\S]*local\.post = local\.__chain1\[0\]\n\} else \{\nlocal\.post = undefined\n\}/);
cases++;
same('bench conditional find without id', [
	'  const posts = input.posts',
	'  const id = input.id ?? null',
	'  const post = id !== null ? posts.find(p => p.id === id) : undefined',
	'  return { post, found: post !== undefined }'
].join('\n'), { posts: [{ id: 1, t: 'a' }] }, { found: false });
cases++;
same('conditional assignments', [
	'  let label = ""',
	'  label = input.items.length > 1 ? input.items.map(x => x.name).join(", ") : "none"',
	'  const pick = input.mode == "first" ? input.items.find(x => x.n > 1) : input.mode == "sorted" ? input.items.toSorted((a, b) => b.n - a.n) : []',
	'  const keys = input.o ? Object.keys(input.o) : []',
	'  return { label, pick, keys, count: input.items.length > 0 ? input.items.filter(x => x.n > 1).length : 0 }'
].join('\n'), { mode: 'sorted', o: { a: 1, b: 2 }, items: [{ name: 'x', n: 1 }, { name: 'y', n: 3 }, { name: 'z', n: 2 }] },
	{ label: 'x, y, z', pick: [{ name: 'y', n: 3 }, { name: 'z', n: 2 }, { name: 'x', n: 1 }], keys: ['a', 'b'], count: 2 });
cases++;
same('conditional result field', '  result.count = input.items.length > 2 ? input.items.filter(x => x > 1).length : -1\n  return', { items: [1, 2, 3] }, undefined);
refuses('list method in a nested conditional', '  const n = 1 + (input.ok ? input.items.filter(x => x > 1).length : 0)', 'FLOWSCRIPT_V3_CHAIN', 3, 'const');
refuses('list method after &&', '  const n = input.ok && input.items.filter(x => x > 1)', 'FLOWSCRIPT_V3_CHAIN', 3, 'const');
refuses('list method in the condition', '  const n = input.items.some(x => x > 1) ? 1 : 2', 'FLOWSCRIPT_V3_CHAIN', 3, 'const');

// 7. xs.concat(ys): JavaScript's concat, list method chains of its arguments run first.
cases++;
same('bench concat', [
	'  let items = []',
	'  for (const page of input.pages) {',
	'    items = items.concat(page.rows.map(row => ({ id: row.id })))',
	'  }',
	'  return { items }'
].join('\n'), { pages: [{ rows: [{ id: 1, x: 0 }, { id: 2 }] }, { rows: [] }, { rows: [{ id: 3 }] }] }, { items: [{ id: 1 }, { id: 2 }, { id: 3 }] },
	/local\.__chain1 = list\.map[\s\S]*local\.items = local\.items\.concat\(local\.__chain1\)/);
cases++;
same('concat values and chains', [
	'  const all = input.a.concat(input.b, 5, [6, [7]])',
	'  const mixed = input.a.filter(x => x > 1).concat(input.b.map(x => x * 2), input.b.filter(x => x > 4))',
	'  return { all, mixed, text: "a".concat(input.b.length), both: input.a.concat(input.b.toSorted((x, y) => y - x)) }'
].join('\n'), { a: [1, 2, 3], b: [4, 5] }, { all: [1, 2, 3, 4, 5, 5, 6, [7]], mixed: [2, 3, 8, 10, 5], text: 'a2', both: [1, 2, 3, 5, 4] });

// The refusal of line 91 of the L3 bench source: Rhino 1.9.2 gives a const the scope of the whole function, so a name
// declared const in one block and declared again in a sibling block is a redeclaration for its parser, not for JavaScript.
var redeclared = 'parsed';
try { parser().parse('function f() { if (true) { const y = 1 } for (let y of []) {} }', 'x', 1); } catch (error) { redeclared = String(error); }
check(redeclared.indexOf('redeclaration of const y') >= 0, 'Rhino 1.9.2 still scopes const to the function: ' + redeclared);
cases++;
same('const declared again after a loop body', [
	'  let total = 0',
	'  for (const raw of input.items) {',
	'    const agg = raw * 2',
	'    total += agg',
	'  }',
	'  const bySum = input.items.toSorted((a, b) => b - a)',
	'  const shown = json.array({ itemType: { type: "object" } })',
	'  for (const agg of bySum) {',
	'    shown.push({ value: agg + 1 })',
	'  }',
	'  return { total, shown }'
].join('\n'), { items: [1, 3, 2] }, { total: 12, shown: [{ value: 4 }, { value: 3 }, { value: 2 }] });
cases++;
same('const declared again in sibling blocks', [
	'  let total = 0',
	'  if (input.n > 0) {',
	'    const y = 1',
	'    total += y',
	'  }',
	'  if (input.n > 0) {',
	'    const y = 2',
	'    total += y * 10',
	'  }',
	'  if (input.n > 0) {',
	'    let y = 3',
	'    total += y * 100',
	'  }',
	'  return { total }'
].join('\n'), { n: 1 }, { total: 321 });
refuses('const without value', '  const x\n  return { x }', 'FLOWSCRIPT_V3_UNSUPPORTED', 3, 'let');

// L0′bis (control bench it67v3c). 1. for…of over Object.keys / Object.values or a list method chain: the list is computed
// once, before the loop, in a hidden local, as JavaScript evaluates the iterated expression once.
cases++;
same('bench for of Object.keys', [
	'  const names = []',
	'  for (const key of Object.keys(input.groups)) {',
	'    names.push(`${key}=${input.groups[key]}`)',
	'  }',
	'  let total = 0',
	'  for (const amount of Object.values(input.groups)) {',
	'    total += amount',
	'  }',
	'  return { names, total }'
].join('\n'), { groups: { b: 2, a: 1, 10: 4, 2: 3 } }, undefined, /local\.__chain1 = object\.keys\(\{ source: input\.groups \}\)\nforEach\(\{ items: local\.__chain1,/);
cases++;
same('for of computed once', [
	'  const byId = json.map({ valueType: { type: "integer" } })',
	'  byId["a"] = 1',
	'  byId["b"] = 2',
	'  for (const key of Object.keys(byId)) {',
	'    byId[`${key}x`] = byId[key] * 10',
	'  }',
	'  const rows = json.array({ itemType: { type: "integer" } })',
	'  rows.push(1)',
	'  rows.push(2)',
	'  for (const n of rows.filter(n => n > 0).map(n => n * 2)) {',
	'    rows.push(n)',
	'  }',
	'  return { byId, rows }'
].join('\n'), {}, { byId: { a: 1, b: 2, ax: 10, bx: 20 }, rows: [1, 2, 2, 4] });

// 2. A slot is a method, a function or an arrow with a block body, wherever a slot exists; a call with a slot that is
// assigned, declared or returned writes its output with $$out.
var slotForms = [['method', '$$nodes() { n++ }'], ['function', '$$nodes: function () { n++ }'], ['arrow', '$$nodes: () => { n++ }']];
slotForms.forEach(function (form) {
	cases++;
	var code = program([
		'  let n = 0',
		'  flow.forEach({ items: input.items, ' + form[1].replace('n++', 'n += current') + ' })',
		'  const loop = flow.while({ condition: n < 10, maxIterations: 20, ' + form[1] + ' })',
		'  let again = null',
		'  again = flow.while({ condition: n < 12, ' + form[1] + ' })',
		'  return { n, loop, again: again.iterations, last: flow.while({ condition: n < 13, ' + form[1] + ' }) }'
	].join('\n'));
	var lowered = translated('slot ' + form[0], code, /while\(\{\n\$\$out: "local\.loop",[\s\S]*\$\$nodes\(\) \{[\s\S]*\$\$out: "local\.again"[\s\S]*\$\$out: "result\.last"/);
	var ran = flowResult('slot ' + form[0], code, { items: [1, 2, 3] }, lowered);
	// the fields of the returned object are read in order: n before the last loop, as in JavaScript
	check(ran === JSON.stringify({ n: 12, loop: { iterations: 4, completed: true }, again: 2, last: { iterations: 1, completed: true } }), 'slot ' + form[0] + ': ' + ran + '\n' + lowered.code);
});
cases++;
var configUse = program('  config.use({\n    overrides: { http: { timeout: 30000 } },\n    $$then: function () {\n      result.timeout = config.http.timeout\n    },\n  })\n  result.after = config.http.timeout');
var configLowered = translated('config.use slot function', configUse, /config\.use\(\{[\s\S]*\$\$then\(\) \{/);
var configRun = api('flowCodeRun', { name: 'Example', code: configUse, input: {}, config: { http: { timeout: 5000 } }, includeTrace: false });
check(configRun.ok && configRun.result.timeout === 30000 && configRun.result.after === 5000, 'config.use slot function: ' + JSON.stringify(configRun).substring(0, 900) + '\n' + configLowered.code);
var transaction = translated('bench sql.transaction slot', program([
	'  const plan = input.items',
	'  const tx = sql.transaction({',
	'    connection: "app",',
	'    onError: "return",',
	'    $$nodes: function () {',
	'      for (const step of plan) {',
	'        local.written = step',
	'      }',
	'    },',
	'  })',
	'  return { ok: tx.ok }'
].join('\n')), /sql\.transaction\(\{\n\$\$out: "local\.tx",\nconnection: "app",\nonError: "return",\n\$\$nodes\(\) \{\nforEach/);
refuses('slot arrow without block', '  let n = 0\n  flow.while({ condition: n < 3, $$nodes: () => n++ })', 'FLOWSCRIPT_V3_FUNCTION', 4, '$$nodes: () => { … }');
refuses('slot with a parameter', '  flow.forEach({ items: input.items, $$nodes: function (item) { result.x = item } })', 'FLOWSCRIPT_V3_FUNCTION', 3, '$$nodes: function () { … }');
refuses('assigned slot call with its own $$out', '  const r = flow.while({ $$out: "local.other", condition: false, $$nodes() {} })', 'FLOWSCRIPT_V3_UNSUPPORTED', 3, '$$out');

// 3. A list method in the condition of an if, outside a lazy place, runs before the if in a hidden local.
[{ actor: { roles: ['USER', 'OWNER'] } }, { actor: { roles: ['USER'] } }].forEach(function (input, index) {
	cases++;
	same('bench if condition ' + index, [
		'  const actor = input.actor',
		'  if (!actor.roles.some(role => role == "OWNER")) {',
		'    return { owner: false }',
		'  }',
		'  return { owner: true }'
	].join('\n'), input, { owner: index === 0 }, /local\.__chain1 = list\.filter\(\{ items: local\.actor\.roles, where: current == "OWNER" \}\)\nif \(!\(local\.__chain1\.length > 0\)\) \{/);
});
[{ a: true }, { a: false, xs: [1, 3, 5], o: {} }, { a: false, xs: [1], o: { k: 1 } }].forEach(function (input, index) {
	cases++;
	same('if conditions ' + index, [
		'  let r = 0',
		'  if (input.a) {',
		'    r = 1',
		'  } else if (input.xs.filter(x => x > 1).length + Object.keys(input.o).length > 1) {',
		'    r = 2',
		'  } else if (Object.keys(input.o).includes("k") ? true : false) {',
		'    r = 3',
		'  }',
		'  return { r }'
	].join('\n'), input, { r: [1, 2, 3][index] });
});
refuses('global call after && in an if', '  if (input.ok && Object.keys(input.o).length > 0) {\n    result.x = 1\n  }', 'FLOWSCRIPT_V3_GLOBAL_CALL', 3, 'own assignment');
refuses('list method after && in an if', '  if (input.ok && input.xs.some(x => x > 1)) {\n    result.x = 1\n  }', 'FLOWSCRIPT_V3_CHAIN', 3, 'const');
refuses('list method in a branch of ?: in an if', '  if (input.ok ? input.xs.some(x => x > 1) : false) {\n    result.x = 1\n  }', 'FLOWSCRIPT_V3_CHAIN', 3, 'const');
refuses('list method in a call argument in an if', '  if (Math.max(input.xs.filter(x => x > 1).length, 1) > 1) {\n    result.x = 1\n  }', 'FLOWSCRIPT_V3_CHAIN', 3, 'const');
refuses('list method in a while condition', '  while (input.xs.some(x => x > 1)) {\n    result.x = 1\n  }', 'FLOWSCRIPT_V3_CHAIN', 3, 'let pending = xs.some(…); while (pending)');

// 4. o.count++ and o.total += x on an object read from a map: the object is shared, as in JavaScript.
cases++;
var aliasCode = program([
	'  const byCat = json.map({ valueType: { type: "object", properties: { count: { type: "number" }, total: { type: "number" } } } })',
	'  for (const row of input.rows) {',
	'    const c = row.category',
	'    if (byCat[c] == null) {',
	'      byCat[c] = { count: 0, total: 0 }',
	'    }',
	'    const g = byCat[c]',
	'    g.count++',
	'    g.total += row.amount',
	'  }',
	'  const stats = { seen: "0" }',
	'  stats.seen++',
	'  stats.seen--',
	'  stats.seen++',
	'  return { byCat, stats }'
].join('\n'));
check(bridge.translate(aliasCode).diagnostics.length === 0, 'the alias update is no longer refused: ' + JSON.stringify(bridge.translate(aliasCode).diagnostics));
same('bench alias update', aliasCode.replace(/^[\s\S]*?\{\n/, '').replace(/\n\}$/, ''), { rows: [{ category: 'a', amount: 2 }, { category: 'b', amount: 5 }, { category: 'a', amount: 3 }] },
	{ byCat: { a: { count: 2, total: 5 }, b: { count: 1, total: 5 } }, stats: { seen: 1 } }, /local\.g\.count = Number\(local\.g\.count\) \+ 1\nlocal\.g\.total = local\.g\.total \+ \(current\.amount\)/);
cases++;
same('result field update', '  result.count = 1\n  result.count++\n  result.count--\n  result.count++', {}, { count: 2 });
refuses('loop item update', '  for (const item of input.items) {\n    item.count++\n  }', 'FLOWSCRIPT_V3_UNSUPPORTED', 4, 'o.count++');
refuses('undeclared update', '  missing++', 'FLOWSCRIPT_V3_UNSUPPORTED', 3, 'Declare the local first');

// Conformance cases of the grammar: each source is lowered and run; a case marked parsesWithoutPreparation is read by the
// Rhino 1.9.2 parser as it is written.
var grammar = JSON.parse(String(files.readFileToString(new java.io.File(engineDir, '../docs/flowscript-v3-grammar.json'), 'UTF-8')));
grammar.conformance.forEach(function (conformance) {
	cases++;
	var lowered = translated(conformance.id, conformance.source);
	if (conformance.parsesWithoutPreparation) parser().parse(conformance.source, conformance.id, 1);
	var run = api('flowCodeRun', { name: /function\s+([\w$]+)/.exec(conformance.source)[1], code: conformance.source, input: conformance.input, includeTrace: false });
	check(run.ok && JSON.stringify(run.result) === JSON.stringify(conformance.expected), conformance.id + ': ' + JSON.stringify(run).substring(0, 1000) + '\n' + lowered.code);
	check(node(conformance.source, conformance.input) === JSON.stringify(conformance.expected), conformance.id + ' in Node');
});
check(grammar.conformance.some(function (conformance) { return conformance.parsesWithoutPreparation; }), 'a conformance case is read without preparation');
print('flowscript-v3-bench-forms OK: ' + cases + ' accepted cases run');
