var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-v3-reader-core-").toFile().getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var codeService = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/flow-code-service.js"), "UTF-8")));
var bridge = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/flowscript-v3-prototype.js"), "UTF-8")));
var Reader = Packages.com.convertigo.libflowengine.FlowScriptV3Reader;
function check(source) {
	var oracle = JSON.parse(String(engine.flowSourceValidate(JSON.stringify({ name: "Example", code: source, skipAnalysis: true }))));
	if (!oracle.ok) throw new Error("Oracle refused: " + JSON.stringify(oracle).substring(0, 1000));
	var direct = JSON.parse(String(Reader.read(source, null)));
	if (direct.diagnostics.length) throw new Error("Reader refused: " + JSON.stringify(direct.diagnostics));
	var expected = codeService.comparable(oracle.definition), actual = codeService.comparable(direct.definition);
	if (actual !== expected) throw new Error("Definition mismatch\nexpected " + expected + "\nactual " + actual);
}
check('const _flow = { sourceVersion: 3 }\nfunction Example() {\n  let x = 1\n  x += 2\n  return { x }\n}');
check('const _flow = { sourceVersion: 3 }\nfunction Example() {\n  result.ok = true\n  return\n}');
check('const _flow = { sourceVersion: 3 }\nfunction Example() {\n  let x\n  x = "hello"\n  x += " world"\n  return x\n}');
check('const _flow = { sourceVersion: 3 }\nfunction Example() {\n  let n = 0\n  if (input.ok) { n++ } else { n-- }\n  return { n }\n}');
check('const _flow = { sourceVersion: 3 }\nfunction Example() {\n  let n = 0\n  while (n < 3) { n++ }\n  return { n }\n}');
check('const _flow = { sourceVersion: 3 }\nfunction Example() {\n  let total = 0\n  for (const item of input.items) { total += item }\n  return { total }\n}');
check('const _flow = { sourceVersion: 3 }\nfunction Example() {\n  let total = 0\n  for (let i = 0; i < 3; i++) { total += i }\n  return { total }\n}');
check('const _flow = { sourceVersion: 3 }\nfunction Example() {\n  switch (input.kind) { case "a": result.n = 1; break; default: result.n = 2; break }\n}');
check('const _flow = { sourceVersion: 3 }\nfunction Example() {\n  try { throw { code: "KNOWN", message: "x" } } catch (failure) { result.code = failure.code }\n}');
check('const _flow = { sourceVersion: 3 }\nfunction Example() {\n  for (const item of input.items) { if (item < 2) { continue }; result.n = item }\n}');
check('const _flow = { sourceVersion: 3 }\nfunction Example() {\n  let total = 0\n  for (const { n } of input.items) { total += n }\n  return { total }\n}');
check('const _flow = { sourceVersion: 3 }\nfunction Example() {\n  let total = 0\n  for (const x of input.items) { for (const y of input.items) { total += x * y } }\n  return { total }\n}');
check('const _flow = { sourceVersion: 3 }\nfunction Example({ input, config, result }) {\n  const sum = total({ rows: input.items })\n  return { sum }\n}\nfunction total({ rows }) {\n  let sum = 0\n  for (const row of rows) { sum += row }\n  return sum\n}');
check('const _flow = { sourceVersion: 3 }\nfunction Example() {\n  const kept = input.items.filter(item => item > 1)\n  const doubled = kept.map(item => item * 2)\n  const first = input.items.find(item => item > 1)\n  const any = input.items.some(item => item > 2)\n  const every = input.items.every(item => item > 0)\n  return { doubled, first, any, every }\n}');
check('const _flow = { sourceVersion: 3 }\nfunction Example() {\n  const sorted = input.items.toSorted((a, b) => b.k - a.k)\n  return { sorted }\n}');
check('const _flow = { sourceVersion: 3 }\nfunction Example() {\n  const sorted = [...input.items].sort((a, b) => a.k.localeCompare(b.k))\n  return { sorted }\n}');
check('const _flow = { sourceVersion: 3 }\nfunction Example() {\n  const labels = input.items.filter(item => item.active).map(item => item.name).join(", ")\n  return { labels }\n}');
check('const _flow = { sourceVersion: 3 }\nfunction Example() {\n  const rows = json.array({ itemType: { type: "integer" } })\n  rows.push(1)\n  return { rows }\n}');
function refuses(body, code, line) {
	var source = 'const _flow = { sourceVersion: 3 }\nfunction Example() {\n' + body + '\n}';
	var oracle = bridge.translate(source).diagnostics, direct = JSON.parse(String(Reader.read(source, null))).diagnostics;
	if (!oracle.length || oracle[0].code !== code || oracle[0].line !== line || !direct.length || direct[0].code !== oracle[0].code || direct[0].line !== oracle[0].line)
		throw new Error('Wrong refusal: expected ' + JSON.stringify(oracle) + ', actual ' + JSON.stringify(direct));
}
refuses('  while (true) {\n    break\n  }', 'FLOWSCRIPT_V3_BREAK', 4);
refuses('  const x = 1\n  x = 2', 'FLOWSCRIPT_V3_CONST_ASSIGN', 4);
refuses('  let flow = 1', 'FLOWSCRIPT_V3_RESERVED_NAME', 3);
refuses('  let x = 1\n  if (true) { let x = 2 }', 'FLOWSCRIPT_V3_SHADOWING', 4);
refuses('  if (true) { let x = 1 }\n  return { x }', 'FLOWSCRIPT_V3_OUT_OF_SCOPE', 4);
refuses('  result.x = 1\n  return { x: 2 }', 'FLOWSCRIPT_V3_RESULT_MIXED', 4);
refuses('  for (const item of input.items) { return { item } }', 'FLOWSCRIPT_V3_RETURN_IN_LOOP', 3);
refuses('  for (let i = 0; i < 3; i += 2) { result.x = i }', 'FLOWSCRIPT_V3_FOR_FORM', 3);
refuses('  try { result.x = 1 } catch (e) {} finally { result.x = 2 }', 'FLOWSCRIPT_V3_FINALLY', 3);
refuses('  for (const key in input.items) { result.x = key }', 'FLOWSCRIPT_V3_LOOP_FORM', 3);
refuses('  switch (input.items.length) { case 1: result.x = 1; case 2: result.x = 2; break }', 'FLOWSCRIPT_V3_SWITCH_FALLTHROUGH', 3);
refuses('  throw new Error("failed")', 'FLOWSCRIPT_V3_ERROR_CODE_CHOICE', 3);
refuses('  if ({ x: 1 }) { result.x = 1 }', 'FLOWSCRIPT_V3_OBJECT_CONDITION', 3);
print('flowscript-v3-reader-core OK');
