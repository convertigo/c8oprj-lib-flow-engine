// `local.rows = json.array({ itemType })` used to crash analysis (indexOf of
// undefined): the assignment did not reach the destination property, and
// analysis ignored the declared default the runtime gives back.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-typed-assignment-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	function flow(body) { return 'const _flow = {sourceVersion:2}\nfunction Typed({ input, config, result }) {\n' + body + '\n}'; }

	var assigned = flow([
		'  local.rows = json.array({ itemType: { type: "string" } })',
		'  local.byCity = json.map({ valueType: { type: "number" } })',
		'  json.push({ path: "local.rows", value: "a" })',
		'  json.put({ path: "local.byCity", key: "Paris", value: 18 })',
		'  result.rows = local.rows',
		'  result.byCity = local.byCity'
	].join("\n"));
	var analysis = api("analyze", { flowSource: assigned });
	assert(analysis.ok, "Analysis of an assigned typed collection crashed: " + JSON.stringify(analysis));
	assert(analysis.schemas["local.rows"].items.type === "string" && analysis.schemas["local.byCity"].additionalProperties.type === "number",
		"Assigned destinations must carry the declared type: " + JSON.stringify(analysis.schemas));
	assert(!analysis.schemas["local.items"] && !analysis.schemas["local.entries"], "The default destination must not be used: " + JSON.stringify(analysis.schemas));
	var run = api("run", { flowSource: assigned, includeTrace: false });
	assert(run.ok && JSON.stringify(run.result) === '{"rows":["a"],"byCity":{"Paris":18}}', "Runtime of assigned typed collections: " + JSON.stringify(run));
	var bad = api("analyze", { flowSource: assigned.replace('value: "a"', 'value: 5') });
	assert(bad.ok && bad.errors.some(function (error) { return error.code === "VALUE_TYPE_MISMATCH"; }), "The assigned type must be enforced: " + JSON.stringify(bad.errors));

	var checked = api("flowSourceValidate", { name: "Typed", code: assigned });
	assert(checked.ok && checked.definition.nodes[0].props.path === "local.rows" && checked.definition.nodes[0].out === "local.rows",
		"The assignment fills the destination property: " + JSON.stringify(checked.definition.nodes[0]));
	var written = api("flowSourceValidate", { name: "Typed", flowSource: checked.source, includeHeader: false });
	var reread = api("flowSourceValidate", { name: "Typed", code: written.code });
	var rewritten = api("flowSourceValidate", { name: "Typed", flowSource: reread.source, includeHeader: false });
	assert(written.ok && rewritten.code === written.code, "Writer is not stable: " + written.code);

	var conflict = api("flowSourceValidate", { name: "Typed", code: flow('  local.rows = json.array({ $$out: "local.other", itemType: { type: "string" } })') });
	assert(!conflict.ok && JSON.stringify(conflict).indexOf("FLOW_SOURCE_OUTPUT_CONFLICT") !== -1, "Conflicting $$out must fail: " + JSON.stringify(conflict));

	// A canonical source omits a destination equal to its default: analysis gives
	// it back as the runtime does instead of crashing.
	var defaulted = flow('  json.array({ itemType: { type: "string" } })\n  json.map({ valueType: { type: "number" } })');
	var defaultAnalysis = api("analyze", { flowSource: defaulted });
	assert(defaultAnalysis.ok && defaultAnalysis.schemas["local.items"].items.type === "string" && defaultAnalysis.schemas["local.entries"].additionalProperties.type === "number",
		"Defaulted destinations: " + JSON.stringify(defaultAnalysis));
	var defaultRun = api("run", { flowSource: defaulted, includeTrace: false, includeLocal: true });
	assert(defaultRun.ok && defaultRun.local.items.length === 0, "Defaulted runtime: " + JSON.stringify(defaultRun));

	print("typed-collection-assignment OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
