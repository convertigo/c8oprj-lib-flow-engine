var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-v3-prototype-").toFile().getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var bridge = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/flowscript-v3-prototype.js"), "UTF-8")));
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }
function check(ok, message) { if (!ok) throw new Error(message); }
function source(body) { return 'const _flow = { sourceVersion: 3 }\nfunction Example({ input, config, result }) {\n' + body + '\n}'; }
function runs(label, body, expected, input) {
	var code = source(body), translated = bridge.translate(code);
	check(!translated.diagnostics.length, label + ' bridge: ' + JSON.stringify(translated));
	var validation = api('flowSourceValidate', { name: 'Example', code: code });
	check(validation.ok, label + ' validation: ' + JSON.stringify(validation).substring(0, 1200) + '\n' + translated.code);
	var result = api('flowCodeRun', { name: 'Example', code: code, input: input || { items: [1, 2, 3] }, includeTrace: false });
	check(result.ok, label + ' run: ' + JSON.stringify(result).substring(0, 1200));
	check(JSON.stringify(result.result) === JSON.stringify(expected), label + ' result: ' + JSON.stringify(result.result) + '\n' + translated.code);
}
function refuses(label, body, code, line) {
	var result = bridge.translate(source(body));
	check(result.diagnostics.length && result.diagnostics[0].code === code && result.diagnostics[0].line === line,
		label + ': ' + JSON.stringify(result));
	check(result.diagnostics[0].message.indexOf(code + ' at line') !== 0 && result.diagnostics[0].hint,
		label + ' needs a readable rule and replacement: ' + JSON.stringify(result.diagnostics[0]));
}
runs('simple', '  let total = 0\n  total += 2\n  return { total }', { total: 2 });
runs('if', '  const value = input.items.length\n  if (value > 2) {\n    return { value }\n  }\n  return { value: 0 }', { value: 3 });
runs('loop', '  let total = 0\n  for (const item of input.items) {\n    total += item\n  }\n  return { total }', { total: 6 });
runs('list methods', '  const kept = input.items.filter(item => item > 1)\n  const doubled = kept.map(item => item * 2)\n  const first = input.items.find(item => item > 1)\n  const any = input.items.some(item => item > 2)\n  const every = input.items.every(item => item > 0)\n  return { doubled, first, any, every }',
	{ doubled: [4, 6], first: 2, any: true, every: true });
runs('counted', '  let total = 0\n  for (let i = 0; i < 4; i++) {\n    total += i\n  }\n  return { total }', { total: 6 });
runs('switch', '  switch (input.items.length) {\n    case 2: result.value = "two"; break\n    case 3: result.value = "three"; break\n    default: result.value = "other"; break\n  }', { value: 'three' });
runs('sort', '  const sorted = [...[{ n: 1 }, { n: 3 }, { n: 2 }]].sort((a, b) => b.n - a.n)\n  return { sorted }', { sorted: [{ n: 3 }, { n: 2 }, { n: 1 }] });
runs('locale sort', '  const sorted = [{ name: "b" }, { name: "a" }].toSorted((a, b) => a.name.localeCompare(b.name))\n  return { sorted }',
	{ sorted: [{ name: 'a' }, { name: 'b' }] });
runs('global', '  const value = JSON.parse("{\\"a\\":1}")\n  const text = JSON.stringify(value, null, 2)\n  return { text }', { text: '{\n  "a": 1\n}' });
runs('for destructuring', '  let total = 0\n  for (const { n } of [{ n: 1 }, { n: 2 }]) { total += n }\n  return { total }', { total: 3 });
runs('flow control', '  let n = 0\n  flow.while({ condition: n < 3, $$nodes() { n++ } })\n  return { n }', { n: 3 });
runs('optional path', '  return { count: input?.items?.length }', { count: 3 });
runs('optional index', '  return { first: input?.items?.[0] }', { first: 1 });
runs('disabled', '  // @disabled\n  result.ignored = 1\n  result.count = input.items.length', { count: 3 });
runs('label', '  label: if (input.items.length > 1) { result.count = 3 }', { count: 3 });
runs('continue and push', '  const kept = json.array({ itemType: { type: "integer" } })\n  for (const item of input.items) {\n    if (item < 2) { continue }\n    kept.push(item)\n  }\n  return { kept }', { kept: [2, 3] });
runs('try catch', '  try { throw { code: "KNOWN", message: "x" } } catch (failure) { result.code = failure.code }', { code: 'KNOWN' });
runs('object keys and default', '  const keys = Object.keys({ a: 1, b: 2 })\n  const fallback = flow.default(null, 4)\n  return { keys, fallback }', { keys: ['a', 'b'], fallback: 4 });
runs('nested default', '  return { value: 1 + flow.default(null, 2) }', { value: 3 });
runs('map put', '  const byId = json.map({ valueType: { type: "integer" } })\n  byId["a"] = 3\n  return { byId }', { byId: { a: 3 } });
runs('declarations', '  let x\n  x = 4\n  x -= 1\n  x *= 2\n  x /= 3\n  x--\n  x++\n  return { x }', { x: 2 });
runs('else if', '  if (input.items.length < 2) { result.n = 1 } else if (input.items.length == 3) { result.n = 3 } else { result.n = 0 }', { n: 3 });
runs('native while', '  let n = 0\n  while (n < 3) { n++ }\n  return { n }', { n: 3 });
runs('object values', '  const values = Object.values({ a: 1, b: 2 })\n  return { values }', { values: [1, 2] });
runs('flow if', '  flow.if({ condition: true, $$then() { result.n = 3 }, $$else() { result.n = 0 } })', { n: 3 });
runs('flow forEach', '  result.n = 0\n  flow.forEach({ items: input.items, $$nodes() { result.n = result.n + current } })', { n: 6 });
runs('flow try', '  flow.try({ error: "local.failure", $$try() { throw { code: "KNOWN", message: "x" } }, $$catch() { result.code = local.failure.code } })', { code: 'KNOWN' });
runs('bare return', '  result.n = 3\n  return\n  result.n = 4', { n: 3 });
runs('value return', '  return 3', 3);
refuses('break', '  while (true) {\n    break\n  }', 'FLOWSCRIPT_V3_BREAK', 4);
refuses('rethrow', '  throw e', 'FLOWSCRIPT_V3_PROTOTYPE_RETHROW', 3);
refuses('const assignment', '  const x = 1\n  x = 2', 'FLOWSCRIPT_V3_CONST_ASSIGN', 4);
refuses('reserved', '  let flow = 1', 'FLOWSCRIPT_V3_RESERVED_NAME', 3);
refuses('shadow', '  let x = 1\n  if (true) { let x = 2 }', 'FLOWSCRIPT_V3_SHADOWING', 4);
refuses('scope', '  if (true) { let x = 1 }\n  return { x }', 'FLOWSCRIPT_V3_OUT_OF_SCOPE', 4);
refuses('mixed result', '  result.x = 1\n  return { x: 2 }', 'FLOWSCRIPT_V3_RESULT_MIXED', 4);
refuses('untyped list', '  const rows = []\n  rows.push(input.items)', 'FLOWSCRIPT_V3_UNTYPED_LIST', 4);
refuses('return in loop', '  for (const item of input.items) { return { item } }', 'FLOWSCRIPT_V3_RETURN_IN_LOOP', 3);
refuses('for form', '  for (let i = 0; i < 3; i += 2) { result.x = i }', 'FLOWSCRIPT_V3_FOR_FORM', 3);
refuses('finally', '  try { result.x = 1 } catch (e) {} finally { result.x = 2 }', 'FLOWSCRIPT_V3_FINALLY', 3);
refuses('loop form', '  for (const key in input.items) { result.x = key }', 'FLOWSCRIPT_V3_LOOP_FORM', 3);
refuses('switch fallthrough', '  switch (input.items.length) { case 1: result.x = 1; case 2: result.x = 2; break }', 'FLOWSCRIPT_V3_SWITCH_FALLTHROUGH', 3);
refuses('global call', '  const x = Object.entries(input.items)', 'FLOWSCRIPT_V3_GLOBAL_CALL', 3);
refuses('nested global call', '  return { x: 1 + JSON.stringify(input.items) }', 'FLOWSCRIPT_V3_GLOBAL_CALL', 3);
refuses('error code', '  throw new Error("failed")', 'FLOWSCRIPT_V3_ERROR_CODE_CHOICE', 3);
refuses('object condition', '  if ({ x: 1 }) { result.x = 1 }', 'FLOWSCRIPT_V3_OBJECT_CONDITION', 3);
refuses('local alias', '  let x = 1\n  local.x = 2', 'FLOWSCRIPT_V3_LOCAL_ALIAS', 4);
refuses('block name', '  let text = 1\n  text.trim({ text: "a" })', 'FLOWSCRIPT_V3_NAME_SHADOWS_BLOCK', 3);
runs('nested for-of captures outer item', '  let total = 0\n  for (const x of input.items) {\n    for (const y of input.items) { total += x * y }\n  }\n  return { total }', { total: 36 });
runs('filter arrow captures outer item', '  let total = 0\n  for (const x of input.items) {\n    const greater = input.items.filter(y => y > x)\n    total += greater.length\n  }\n  return { total }', { total: 3 });
runs('flow.forEach captures outer item', '  let total = 0\n  for (const x of input.items) {\n    flow.forEach({ items: input.items, $$nodes() { total += x * current } })\n  }\n  return { total }', { total: 36 });
runs('list block captures outer item', '  let total = 0\n  for (const x of input.items) {\n    const greater = list.filter({ items: input.items, where: current > x })\n    total += greater.length\n  }\n  return { total }', { total: 3 });
runs('destructured outer item', '  let total = 0\n  for (const { id, lines } of input.orders) {\n    for (const line of lines) { total += id * line }\n  }\n  return { total }', { total: 17 }, { orders: [{ id: 2, lines: [3, 4] }, { id: 3, lines: [1] }] });
runs('counted local in while', '  let total = 0\n  for (let i = 1; i < 4; i++) {\n    const candidate = i\n    let done = false\n    while (done == false) { total += candidate; done = true }\n  }\n  return { total }', { total: 6 });
refuses('chain branch', '  const x = input.items.filter(item => item > 1) + 1', 'FLOWSCRIPT_V3_CHAIN', 3);
refuses('compound expression', '  let x = 1\n  const y = x++', 'FLOWSCRIPT_V3_COMPOUND_CONTEXT', 4);
refuses('destructuring default', '  const { x = 1 } = input.items', 'FLOWSCRIPT_V3_DESTRUCTURING', 3);
refuses('import syntax', '  import { trim } from "text"', 'FLOWSCRIPT_V3_IMPORT_SYNTAX', 3);
refuses('function', '  const f = x => x', 'FLOWSCRIPT_V3_FUNCTION', 3);
refuses('list method', '  const x = input.items.reduce((a, b) => a + b, 0)', 'FLOWSCRIPT_V3_LIST_METHOD', 3);
var inplaceSort = bridge.translate(source('  const sorted = input.items.sort((a, b) => a - b)'));
check(inplaceSort.diagnostics.length && /sorts in place/.test(inplaceSort.diagnostics[0].message) && /toSorted/.test(inplaceSort.diagnostics[0].hint),
	'in-place sort message names rule and replacement: ' + JSON.stringify(inplaceSort.diagnostics));
refuses('unsupported', '  result.x = this', 'FLOWSCRIPT_V3_UNSUPPORTED', 3);
runs('block comment', '  /* keep me */ result.x = 1', { x: 1 });
var commentsCode = source('  /* attached\n   * second line */\n  result.x = 1\n\n  /* standalone */\n\n  result.y = 2');
var commentsTranslated = bridge.translate(commentsCode);
check(!commentsTranslated.diagnostics.length && /\/\/ attached\n\/\/ second line\nresult.x/.test(commentsTranslated.code) &&
	/\/\/ standalone\n\nresult.y/.test(commentsTranslated.code), 'block comment placement: ' + JSON.stringify(commentsTranslated));
var commentsRun = api('flowCodeRun', { name: 'Example', code: commentsCode, includeTrace: false });
check(commentsRun.ok && JSON.stringify(commentsRun.result) === JSON.stringify({ x: 1, y: 2 }), 'block comments run: ' + JSON.stringify(commentsRun).substring(0, 1000));
runs('counted upper bound', '  let total = 0\n  for (let i = 0; i <= 3; i++) { total += i }\n  return { total }', { total: 6 });
refuses('counted body assignment', '  for (let i = 0; i < 3; i++) { i = 2 }', 'FLOWSCRIPT_V3_FOR_FORM', 3);
var counted = bridge.translate(source('  for (let i = 0; i < 3; i++) { result.i = i }'));
check(counted.code.indexOf('maxIterations: 1000000') >= 0, 'counted loop bound: ' + counted.code);
var helperCode = source('  const sum = total({ rows: input.items })\n  return { sum }') + '\nfunction total({ rows }) {\n  let sum = 0\n  for (const row of rows) { sum += row }\n  return sum\n}';
var helperTranslation = bridge.translate(helperCode);
check(!helperTranslation.diagnostics.length, 'helper translation: ' + JSON.stringify(helperTranslation));
var helperRun = api('flowCodeRun', { name: 'Example', code: helperCode, input: { items: [1, 2, 3] }, includeTrace: false });
check(helperRun.ok && JSON.stringify(helperRun.result) === JSON.stringify({ sum: 6 }), 'helper run: ' + JSON.stringify(helperRun).substring(0, 1100) + '\n' + helperTranslation.code);
var helperValidation = api('flowSourceValidate', { name: 'Example', code: helperCode });
check(!(helperValidation.diagnostics || []).some(function (diagnostic) { return diagnostic.code === 'FLOWSCRIPT_INPUT_NOT_DECLARED' && (diagnostic.missingInputs || []).indexOf('rows') >= 0; }),
	'helper parameter is not a Flow input: ' + JSON.stringify(helperValidation).substring(0, 1000));
refuses('nested helper', '  function inner({ rows }) { return rows }', 'FLOWSCRIPT_V3_FUNCTION', 3);
function nodeSorted(items, comparator) {
	var script = 'const xs = JSON.parse(process.argv[1]); process.stdout.write(JSON.stringify(xs.toSorted(' + comparator + ')))';
	var command = new java.util.ArrayList();
	['node', '-e', script, JSON.stringify(items)].forEach(function (part) { command.add(new java.lang.String(String(part))); });
	var process = new java.lang.ProcessBuilder(command).redirectErrorStream(true).start();
	var reader = new java.io.BufferedReader(new java.io.InputStreamReader(process.getInputStream(), 'UTF-8'));
	var output = '', part;
	while ((part = reader.readLine()) !== null) output += String(part);
	check(process.waitFor() === 0, 'Node comparator: ' + output);
	return JSON.parse(output);
}
function sortParity(label, items, comparator, copySort) {
	var expression = copySort ? '[...input.items].sort(' + comparator + ')' : 'input.items.toSorted(' + comparator + ')';
	var code = source('  const sorted = ' + expression + '\n  return { sorted }');
	var translated = bridge.translate(code);
	check(!translated.diagnostics.length, label + ' bridge: ' + JSON.stringify(translated));
	var before = JSON.stringify(items);
	var result = api('flowCodeRun', { name: 'Example', code: code, input: { items: items }, includeTrace: false });
	check(result.ok, label + ' run: ' + JSON.stringify(result).substring(0, 1000));
	var expected = nodeSorted(items, comparator);
	check(JSON.stringify(result.result.sorted) === JSON.stringify(expected), label + ' parity: ' + JSON.stringify(result.result.sorted) + ' vs ' + JSON.stringify(expected) + '\n' + translated.code);
	check(JSON.stringify(items) === before, label + ' changed source');
}
var numericRows = [{ id: 'a', k: 10 }, { id: 'b', k: 9 }, { id: 'c', k: '10' }, { id: 'd', k: '9' }, { id: 'e' }, { id: 'f', k: 9 }];
sortParity('numeric ascending', numericRows, '(a, b) => a.k - b.k', false);
sortParity('numeric descending copy', numericRows, '(a, b) => b.k - a.k', true);
var textRows = [{ id: 'a', k: 'Éclair' }, { id: 'b', k: 'eclair' }, { id: 'c', k: 'Banane' }, { id: 'd', k: 'banane' }, { id: 'f', k: 'Éclair' }];
sortParity('locale ascending', textRows, '(a, b) => a.k.localeCompare(b.k)', false);
sortParity('locale descending', textRows, '(a, b) => b.k.localeCompare(a.k)', false);
sortParity('locale absent key', textRows.concat([{ id: 'e' }]), '(a, b) => String(a.k).localeCompare(String(b.k))', false);
sortParity('identity numeric ascending', [10, 2, 1, 2], '(a, b) => a - b', false);
sortParity('identity numeric descending', [10, 2, 1, 2], '(a, b) => b - a', false);
sortParity('identity locale ascending', ['Éclair', 'Banane', 'banane'], '(a, b) => a.localeCompare(b)', false);
sortParity('identity locale descending', ['Éclair', 'Banane', 'banane'], '(a, b) => b.localeCompare(a)', false);
sortParity('identity String locale ascending', ['Éclair', 'Banane', 'banane'], '(a, b) => String(a).localeCompare(String(b))', false);
sortParity('identity String locale descending', ['Éclair', 'Banane', 'banane'], '(a, b) => String(b).localeCompare(String(a))', false);
var identityTranslation = bridge.translate(source('  const sorted = input.items.toSorted((a, b) => a - b)\n  return { sorted }'));
check(/list\.sort\(\{ items: input\.items, compare: "number"/.test(identityTranslation.code) && identityTranslation.code.indexOf('by:') < 0,
	'identity comparator omits by: ' + identityTranslation.code);
var sampleCases = [
	{ file: 'primes-nested-loop.flow.js', name: 'primes', input: { n: '10' }, expected: { primes: [2, 3, 5, 7], count: 4 } },
	{ file: 'primes-helper.flow.js', name: 'primes', input: { n: '10' }, expected: { primes: [2, 3, 5, 7], count: 4 } },
	{ file: 'stats-sort.flow.js', name: 'stats', input: { values: '3,1,4,2' }, expected: { count: 4, min: 1, max: 4, mean: 2.5, median: 2.5 } }
];
sampleCases.forEach(function (sample) {
	var code = String(files.readFileToString(new java.io.File(engineDir, '../../samples-m1/' + sample.file), 'UTF-8'));
	var lowered = bridge.translate(code);
	check(!lowered.diagnostics.length, sample.file + ' translation: ' + JSON.stringify(lowered));
	var result = api('flowCodeRun', { name: sample.name, code: code, input: sample.input, includeTrace: false });
	check(result.ok && JSON.stringify(result.result) === JSON.stringify(sample.expected), sample.file + ' run: ' + JSON.stringify(result).substring(0, 1200) + '\n' + lowered.code);
	if (sample.file === 'primes-helper.flow.js') {
		var validation = api('flowSourceValidate', { name: sample.name, code: code });
		check(!(validation.diagnostics || []).some(function (diagnostic) { return diagnostic.code === 'FLOWSCRIPT_INPUT_NOT_DECLARED' && (diagnostic.missingInputs || []).indexOf('value') >= 0; }),
			'helper value is not an undeclared Flow input: ' + JSON.stringify(validation).substring(0, 1000));
	}
	if (sample.file === 'primes-nested-loop.flow.js') {
		var refused = api('flowCodeSet', { name: sample.name, code: code.replace('divisor++', 'break') });
		check(!refused.ok && refused.error.code === 'FLOWSCRIPT_V3_BREAK' && !refused.proposedPatch,
			'v3 refusal has no v2 patch: ' + JSON.stringify(refused).substring(0, 1100));
	}
});
var rejectedWrite = api('flowCodeSet', { name: 'BadExample', code: source('  while (true) {\n    break\n  }') });
check(!rejectedWrite.ok && rejectedWrite.error.code === 'FLOWSCRIPT_V3_BREAK' && rejectedWrite.error.details.diagnostics[0].line === 4,
	'refus API avec ligne v3: ' + JSON.stringify(rejectedWrite).substring(0, 900));
var lineWitness = bridge.translate(source('  let n = 1\n  n++\n  return { n }'));
check(lineWitness.code.split('\n').length === lineWitness.lineMap.length &&
	lineWitness.lineMap[lineWitness.code.split('\n').findIndex(function (line) { return line.indexOf('local.n = Number(local.n) + 1') === 0; })] === 4,
	'correspondance des lignes: ' + JSON.stringify(lineWitness));
var renderer = eval(String(files.readFileToString(new java.io.File(engineDir, 'modules/flow-script-renderer-service.js'), 'UTF-8')));
var renderError = null;
try { renderer.renderFlowScript({}, 'Example', '{}', {}, { parseSource: function () { return { flow: { sourceVersion: 3 } }; } }); }
catch (error) { renderError = error; }
check(renderError && renderError.code === 'FLOWSCRIPT_V3_PROTOTYPE_RENDER', 'refus de rendu de l’arbre v3');
var spec = String(files.readFileToString(new java.io.File(engineDir, '../docs/flowscript-v3.md'), 'UTF-8'));
var examples = /```flowscript(?: refused=([^\s]+))?\n([\s\S]*?)\n```/g, match, count = 0;
while ((match = examples.exec(spec)) !== null) {
	count++;
	var output = bridge.translate(match[2]);
	var refusedCode = match[1] || (count === 6 ? 'FLOWSCRIPT_V3_PROTOTYPE_RETHROW' : '');
	if (refusedCode) check(output.diagnostics.length && output.diagnostics[0].code === refusedCode,
		'exemple ' + count + ' refus: ' + JSON.stringify(output));
	else {
		check(!output.diagnostics.length, 'exemple ' + count + ' traduction: ' + JSON.stringify(output));
		var accepted = api('flowSourceValidate', { name: 'SpecExample' + count, code: match[2] });
		check(accepted.ok, 'exemple ' + count + ' analyse: ' + JSON.stringify(accepted).substring(0, 1000));
		if (count === 1 || count === 3 || count === 5) {
			var sample = count === 1 ? { input: { name: ' Ada ' }, expected: { message: 'Hello Ada' } }
				: count === 3 ? { input: { items: [{ amount: 1 }, { amount: 2 }] }, config: { billing: { currency: 'EUR' } }, expected: { total: 3, count: 2, currency: 'EUR' } }
				: { input: { rows: [
					{ name: 'A', active: true, score: 2, vip: false, late: false },
					{ name: 'B', active: false, score: 5, vip: true, late: true },
					{ name: 'C', active: true, score: 3, vip: false, late: true }
				] }, expected: { names: 'A, C', first: { name: 'B', active: false, score: 5, vip: true, late: true }, anyLate: true,
					top: [{ name: 'C', active: true, score: 3, vip: false, late: true }, { name: 'A', active: true, score: 2, vip: false, late: false }], late: 2 } };
			var execution = api('flowCodeRun', { name: 'SpecExample' + count, code: match[2], input: sample.input, config: sample.config || {}, includeTrace: false });
			check(execution.ok && JSON.stringify(execution.result) === JSON.stringify(sample.expected), 'exemple ' + count + ' exécution: ' + JSON.stringify(execution).substring(0, 1100));
		}
	}
}
check(count === 8, 'huit exemples: ' + count);
var original = source('  // Keep this spelling\n  const n = input.items.length\n  return { n }');
var set = api('flowCodeSet', { name: 'Example', code: original });
check(set.ok, 'code-set v3: ' + JSON.stringify(set).substring(0, 900));
var promoted = api('flowCodePromote', { name: 'Example', revision: set.revision });
check(promoted.ok, 'code-promote v3: ' + JSON.stringify(promoted).substring(0, 900));
var read = api('flowCodeGet', { name: 'Example' });
check(read.ok && read.code === original, 'texte v3 conservé: ' + JSON.stringify(read).substring(0, 900));
print('flowscript-v3-prototype OK');
