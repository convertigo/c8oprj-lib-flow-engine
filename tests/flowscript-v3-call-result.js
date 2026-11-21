// FlowScript v3: a field of a block call result read in the same expression, as JavaScript reads it:
//   const total = flow.call({ flow: "OrdersCount", input: {} }).total    and    if (entity.read({ … }).values.active) { … }
// were handed to the expression compiler, which refused the block call (INVALID_EXPRESSION, "Unknown expression
// function"). Both readers now lower them as const r = block({ … }); const total = r.total: the call writes a hidden
// local before the statement, whose field the expression reads, where the call always runs (the whole value of a
// declaration, an assignment or a return, a branch of a whole ?:, a place a value or an if condition always evaluates).
// Elsewhere both refuse the read (FLOWSCRIPT_V3_CALL_RESULT) with the two statements to write.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-v3-call-result-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var Reader = Packages.com.convertigo.libflowengine.FlowScriptV3Reader;
var checks = 0;
function check(ok, message) { checks++; if (!ok) throw new Error(message); }
// A project block standing for entity.read: the row of an id.
files.writeStringToFile(new java.io.File(project, "_flow/blocks/store/read.block.js"), [
	'const _meta = {',
	'  "sourceVersion": 3,',
	'  "description": "Reads a row.",',
	'  "properties": { "id": { "kind": "value", "type": "integer" } },',
	'  "outputs": { "out": { "type": "object" } },',
	'}',
	'',
	'const _flow = { sourceVersion: 3 }',
	'',
	'function store_read({ input, config, result }) {',
	'  return { id: input.id, name: `row ${input.id}`, active: input.id > 5, values: { active: input.id > 5, tags: ["a", "b"] } }',
	'}',
	''
].join("\n"), "UTF-8");
// The Flow that flow.call calls.
files.writeStringToFile(new java.io.File(project, "_flow/flows/OrdersCount.flow.js"), [
	'const _flow = { sourceVersion: 3 }',
	'',
	'function OrdersCount({ input, config, result }) {',
	'  return { total: 3 }',
	'}',
	''
].join("\n"), "UTF-8");

try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	var bridge = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/flowscript-v3-prototype.js"), "UTF-8")));
	var codeService = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/flow-code-service.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }
	function program(body) {
		return 'const _flow = { sourceVersion: 3, inputs: { id: { type: "integer" }, name: { type: "string" }, items: { type: "array" } } }\n\n' +
			'const { trim } = flow.import("text")\n\n' +
			'function Example({ input, config, result }) {\n' + body + '\n}\n';
	}
	// Both readers read the same definition, the engine runs it, and it renders back to a v3 source that reads the same.
	function runs(label, body, cases) {
		var code = program(body);
		var validation = api("flowSourceValidate", { name: "Example", code: code });
		check(validation.ok, label + " validation: " + JSON.stringify(validation).substring(0, 1200));
		cases.forEach(function (item) {
			var run = api("flowCodeRun", { name: "Example", code: code, input: item[0], includeTrace: false });
			check(run.ok && JSON.stringify(run.result) === JSON.stringify(item[1]), label + " run " + JSON.stringify(item[0]) + ": " + JSON.stringify(run).substring(0, 1200));
		});
		var lowered = bridge.translate(code);
		check(!lowered.diagnostics.length, label + " bridge: " + JSON.stringify(lowered.diagnostics));
		var oracle = api("flowSourceValidate", { name: "Example", code: lowered.code, skipAnalysis: true });
		check(oracle.ok, label + " oracle: " + JSON.stringify(oracle).substring(0, 1200) + "\n" + lowered.code);
		oracle.definition.flow = Object.assign({}, oracle.definition.flow || {}, { sourceVersion: 3 });
		var direct = JSON.parse(String(Reader.read(code, null)));
		check(!direct.diagnostics.length, label + " Java reader: " + JSON.stringify(direct.diagnostics));
		check(codeService.comparableDefinition(oracle.definition) === codeService.comparableDefinition(direct.definition),
			label + " same definition:\n" + codeService.comparableDefinition(oracle.definition) + "\n" + codeService.comparableDefinition(direct.definition));
		var rendered = api("flowCodeMigrateV3", { name: "Example", code: code, rerender: true });
		check(rendered.ok, label + " rendering: " + JSON.stringify(rendered).substring(0, 1200));
		return direct.definition;
	}

	// The two forms of the bench.
	var called = runs("field of a called Flow", '  const total = flow.call({ flow: "OrdersCount", input: {} }).total\n  return { total }', [[{}, { total: 3 }]]);
	check(called.nodes[0].block === "flow.call" && called.nodes[0].out === "local.__chain1" &&
		called.nodes[1].block === "set" && called.nodes[1].props.path === "local.total" && called.nodes[1].props.value === "${local.__chain1.total}",
		"the call writes a hidden local, whose field is read: " + JSON.stringify(called.nodes));
	var tested = runs("if condition", '  if (store.read({ id: input.id }).values.active) {\n    return { active: true }\n  }\n  return { active: false }',
		[[{ id: 7 }, { active: true }], [{ id: 2 }, { active: false }]]);
	check(tested.nodes[0].block === "store.read" && tested.nodes[0].out === "local.__chain1" && tested.nodes[1].block === "if" &&
		tested.nodes[1].props.condition === "local.__chain1.values.active", "the condition reads the hidden local: " + JSON.stringify(tested.nodes));
	// The other safe places: an assignment, a return, a place a value or a condition always evaluates, a branch of a whole ?:.
	runs("result fields", '  result.name = store.read({ id: input.id }).name\n  result.first = store.read({ id: input.id }).values.tags[0]', [[{ id: 7 }, { name: "row 7", first: "a" }]]);
	runs("return", '  return store.read({ id: input.id }).name', [[{ id: 4 }, "row 4"]]);
	runs("in a return object", '  return { name: store.read({ id: input.id }).name, size: trim({ text: input.name }).length }', [[{ id: 4, name: " Ada " }, { name: "row 4", size: 3 }]]);
	runs("always evaluated in a value", '  const label = store.read({ id: input.id }).name + "!"\n  const upper = trim({ text: input.name }).toUpperCase()\n  return { label, upper }',
		[[{ id: 1, name: " ada " }, { label: "row 1!", upper: "ADA" }]]);
	runs("element of a list result", '  const second = text.split({ text: input.name, separator: "," })[1]\n  return { second }', [[{ name: "a,b,c" }, { second: "b" }]]);
	runs("left of && and negated", '  let n = 0\n  if (!store.read({ id: input.id }).active && input.id > 0) {\n    n = 1\n  }\n  return { n }',
		[[{ id: 2 }, { n: 1 }], [{ id: 9 }, { n: 0 }]]);
	runs("branch of a whole ?:", '  const name = input.id > 5 ? store.read({ id: input.id }).name : "none"\n  return { name }', [[{ id: 7 }, { name: "row 7" }], [{ id: 1 }, { name: "none" }]]);
	runs("destructured", '  const { active } = store.read({ id: input.id }).values\n  return { active }', [[{ id: 9 }, { active: true }]]);
	runs("in a branch", '  if (input.id > 0) {\n    const total = flow.call({ flow: "OrdersCount", input: {} }).total\n    return { total }\n  }\n  return { total: 0 }', [[{ id: 1 }, { total: 3 }]]);
	// A method of a local is not a block call: it stays an expression.
	runs("method of a local", '  const items = input.items\n  const count = items.concat({ id: 9 }).length\n  return { count }', [[{ items: [1, 2] }, { count: 3 }]]);
	// The same as the two statements it stands for.
	var twoStatements = api("flowCodeRun", { name: "Example", code: program('  const r = flow.call({ flow: "OrdersCount", input: {} })\n  const total = r.total\n  return { total }'), input: {}, includeTrace: false });
	check(twoStatements.ok && JSON.stringify(twoStatements.result) === JSON.stringify({ total: 3 }), "two statements: " + JSON.stringify(twoStatements));

	// Elsewhere both readers refuse the read, with the two statements to write.
	function refuses(label, body, line, proposal) {
		var code = program(body), read = JSON.parse(String(Reader.read(code, null))).diagnostics[0] || {}, oracle = bridge.translate(code).diagnostics[0] || {};
		check(read.code === "FLOWSCRIPT_V3_CALL_RESULT" && read.line === line && String(read.hint).indexOf(proposal) >= 0, label + ": " + JSON.stringify(read));
		check(oracle.code === read.code && oracle.line === read.line && oracle.message === read.message && oracle.hint === read.hint,
			label + " (bridge): " + JSON.stringify(oracle) + " instead of " + JSON.stringify(read));
		var validation = api("flowSourceValidate", { name: "Example", code: code });
		check(!validation.ok && JSON.stringify(validation).indexOf("FLOWSCRIPT_V3_CALL_RESULT") >= 0, label + " validation: " + JSON.stringify(validation).substring(0, 800));
	}
	refuses("lazy operand", '  const active = input.id > 0 && store.read({ id: input.id }).active\n  return { active }', 6,
		"const r = store.read({ … }); const active = r.active.");
	refuses("lazy if operand", '  if (input.id > 0 || store.read({ id: input.id }).values.active) {\n    return { ok: true }\n  }\n  return { ok: false }', 6,
		"const r = store.read({ … }); const active = r.values.active.");
	refuses("argument", '  const t = text.trim({ text: store.read({ id: input.id }).name })\n  return { t }', 6, "const r = store.read({ … }); const name = r.name.");
	refuses("branch of an inner ?:", '  const label = "#" + (input.id > 5 ? store.read({ id: input.id }).name : "none")\n  return { label }', 6, "const name = r.name.");
	refuses("list arrow", '  const names = input.items.map(item => store.read({ id: item }).name)\n  return { names }', 6, "const r = store.read({ … }); const name = r.name.");
	refuses("for…of list", '  let n = 0\n  for (const tag of store.read({ id: input.id }).values.tags) {\n    n++\n  }\n  return { n }', 7, "const tags = r.values.tags.");
	refuses("while condition", '  let id = input.id\n  while (store.read({ id: id }).active) {\n    id--\n  }\n  return { id }', 7,
		"keep the result in a let, computed before the loop and again at the end of the body (let r = store.read({ … }); while (… r.active …)");

	print("flowscript-v3-call-result: " + checks + " checks passed");
} finally {
	files.deleteQuietly(project);
}
