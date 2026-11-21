// FlowScript v3: return entity.read({ … }) returns the result of a block call, as JavaScript does. Both readers lower it
// as const row = entity.read({ … }); return row, the call writing a hidden local: it was handed to the expression
// compiler, which refused the block call (INVALID_EXPRESSION, "Unknown expression function").
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-v3-return-call-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var Reader = Packages.com.convertigo.libflowengine.FlowScriptV3Reader;
var checks = 0;
function check(ok, message) { checks++; if (!ok) throw new Error(message); }
// A project block standing for entity.read: it returns the row of an id.
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
	'  return { id: input.id, name: `row ${input.id}` }',
	'}',
	''
].join("\n"), "UTF-8");

try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	var bridge = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/flowscript-v3-prototype.js"), "UTF-8")));
	var codeService = eval(String(files.readFileToString(new java.io.File(engineDir, "modules/flow-code-service.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(String(engine[name](JSON.stringify(request)))); }
	function program(body, after) {
		return 'const _flow = { sourceVersion: 3, inputs: { id: { type: "integer" }, name: { type: "string" }, items: { type: "array" } } }\n\n' +
			'const { trim } = flow.import("text")\n\n' +
			'function Example({ input, config, result }) {\n' + body + '\n}\n' + (after || '');
	}
	function runs(label, body, input, expected, after) {
		var code = program(body, after);
		var validation = api("flowSourceValidate", { name: "Example", code: code });
		check(validation.ok, label + " validation: " + JSON.stringify(validation).substring(0, 1200));
		var run = api("flowCodeRun", { name: "Example", code: code, input: input, includeTrace: false });
		check(run.ok && JSON.stringify(run.result) === JSON.stringify(expected), label + " run: " + JSON.stringify(run).substring(0, 1200));
		// the oracle (the bridge, then the v2 parser) reads the same definition
		var lowered = bridge.translate(code);
		check(!lowered.diagnostics.length, label + " bridge: " + JSON.stringify(lowered.diagnostics));
		var oracle = api("flowSourceValidate", { name: "Example", code: lowered.code, skipAnalysis: true });
		check(oracle.ok, label + " oracle: " + JSON.stringify(oracle).substring(0, 1200) + "\n" + lowered.code);
		oracle.definition.flow = Object.assign({}, oracle.definition.flow || {}, { sourceVersion: 3 });
		var direct = JSON.parse(String(Reader.read(code, null)));
		check(codeService.comparableDefinition(oracle.definition) === codeService.comparableDefinition(direct.definition),
			label + " same definition:\n" + codeService.comparableDefinition(oracle.definition) + "\n" + codeService.comparableDefinition(direct.definition));
		// the definition renders back to a v3 source that reads the same (the guard of the code tools)
		var rendered = api("flowCodeMigrateV3", { name: "Example", code: code, rerender: true });
		check(rendered.ok, label + " rendering: " + JSON.stringify(rendered).substring(0, 1200));
		return direct.definition;
	}

	var definition = runs("project block", '  return store.read({ id: input.id })', { id: 7 }, { id: 7, name: "row 7" });
	check(definition.nodes.length === 2 && definition.nodes[0].block === "store.read" && definition.nodes[0].out === "local.__chain1" &&
		definition.nodes[1].block === "return" && definition.nodes[1].props.value === "${local.__chain1}",
		"the call writes a hidden local, returned: " + JSON.stringify(definition.nodes));
	runs("namespace block", '  return text.trim({ text: input.name })', { name: " Ada " }, "Ada");
	runs("imported block", '  return trim({ text: input.name })', { name: " Ada " }, "Ada");
	runs("in a branch", '  if (input.id > 0) {\n    return store.read({ id: input.id })\n  }\n  return { id: 0 }', { id: 3 }, { id: 3, name: "row 3" });
	runs("helper", '  return total({ rows: input.items })', { items: [1, 2, 3] }, 6,
		'\nfunction total({ rows }) {\n  let sum = 0\n  for (const row of rows) {\n    sum += row\n  }\n  return sum\n}\n');
	// the same as the two statements it stands for
	var twoStatements = api("flowCodeRun", { name: "Example", code: program('  const row = store.read({ id: input.id })\n  return row'), input: { id: 7 }, includeTrace: false });
	check(twoStatements.ok && JSON.stringify(twoStatements.result) === JSON.stringify({ id: 7, name: "row 7" }), "two statements: " + JSON.stringify(twoStatements));

	print("flowscript-v3-return-call: " + checks + " checks passed");
} finally {
	files.deleteQuietly(project);
}
