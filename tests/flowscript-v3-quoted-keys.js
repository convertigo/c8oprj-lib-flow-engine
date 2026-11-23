// FlowScript v3 is a subset of JavaScript: a returned object with a quoted key, return { "ok": true }, was refused by both
// readers (FLOWSCRIPT_V3_DESTRUCTURING, "Write explicit result fields"; found by the plan skeleton of the light bench,
// 23/11), as an object of a key that is not a name ({ "amount-eur": 1 }). A quoted name is now the result field of that
// name, as a bare one; another key makes the object a value returned whole. Both readers agree, the engine runs it.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-v3-quoted-keys-").toFile();
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

	runs("quoted names", '  return { "ok": true, "total": input.id }', [[{ id: 2 }, { ok: true, total: 2 }]]);
	var nested = runs("quoted names inside", '  return { "deals": [{ "id": "D-1", "amount": 1200 }], total: 1 }',
		[[{}, { deals: [{ id: "D-1", amount: 1200 }], total: 1 }]]);
	runs("bare and quoted alike", '  const label = input.name\n  return { label, "size": 3 }', [[{ name: "a" }, { label: "a", size: 3 }]]);
	runs("a key that is not a name", '  return { "amount-eur": input.id, "2": "two", ok: true }', [[{ id: 5 }, { "2": "two", "amount-eur": 5, ok: true }]]);
	runs("a single quote", "  return { 'ok': false }", [[{}, { ok: false }]]);
	// what a bare return object always gave: the fields of result
	check(JSON.stringify(nested.nodes.map(function (n) { return n.block + ":" + (n.props && n.props.path || ""); })) ===
		JSON.stringify(["set:result.deals", "set:result.total", "return:"]), "one result field per quoted name: " + JSON.stringify(nested.nodes));
	// still refused: a member that is not a field
	var getter = JSON.parse(String(Reader.read(program('  return { get ok() { return true } }'), null))).diagnostics[0] || {};
	check(/^FLOWSCRIPT_V3_/.test(String(getter.code)), "a getter stays refused: " + JSON.stringify(getter));

	print("flowscript-v3-quoted-keys: " + checks + " checks passed");
} finally {
	files.deleteQuietly(project);
}
