// A project block property that declares only a type (no kind) is read as the FlowScript compiler lowers its value:
// a list, an object, a boolean or a number as an expression, a string as a template. The block received instead the
// text of the argument: "input.months" for months: input.months, "false" for enabled: false, so date.add gave null
// and !input.enabled was false for false.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-typed-property-arguments-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function equal(actual, expected, message) { assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual) + " instead of " + JSON.stringify(expected)); }
function write(file, text) { files.writeStringToFile(file, String(text), "UTF-8"); }
function read(file) { return String(files.readFileToString(file, "UTF-8")); }
try {
	write(new java.io.File(project, "_flow/blocks/demo/shift.block.js"), [
		'const _meta = {',
		'  "sourceVersion": 2,',
		'  "description": "Shifts a date by a number of months.",',
		'  "properties": {',
		'    "start": { "type": "string" },',
		'    "months": { "type": "integer" },',
		'    "enabled": { "type": "boolean" },',
		'    "tags": { "type": "array" },',
		'    "options": { "type": "object" },',
		'    "ratio": { "type": "number", "default": 0.5 }',
		'  },',
		'  "outputs": { "out": { "type": "object", "properties": {',
		'    "shifted": { "type": "string" }, "months": { "type": "integer" }, "disabled": { "type": "boolean" },',
		'    "tagCount": { "type": "integer" }, "mode": { "type": "string" }, "ratio": { "type": "number" }, "start": { "type": "string" }',
		'  } } }',
		'}',
		'function shift({ input, config, result }) {',
		'  local.shifted = date.add({ value: input.start, months: input.months })',
		'  return { shifted: local.shifted, months: input.months, disabled: !input.enabled, tagCount: input.tags.length, mode: input.options.mode, ratio: input.ratio, start: input.start }',
		'}',
		''
	].join("\n"));
	write(new java.io.File(project, "_flow/flows/Shift.flow.js"), [
		'const _flow = { sourceVersion: 2, inputs: { start: { type: "string", default: "2026-01-31" }, months: { type: "integer", default: 3 }, enabled: { type: "boolean", default: false } } }',
		'function Shift({ input, result }) {',
		'  local.count = 2',
		'  local.on = true',
		'  result.literal = demo.shift({ start: input.start, months: 6, enabled: false, tags: ["a"], options: { mode: "fast" } })',
		'  result.fromInput = demo.shift({ start: input.start, months: input.months, enabled: input.enabled, tags: [], options: {} })',
		'  result.fromLocal = demo.shift({ start: input.start, months: local.count + 1, enabled: local.on, tags: ["a", "b"], options: { mode: "slow" }, ratio: local.count / 4 })',
		'  local.rows = list.map({ items: [{ m: 1, on: false }, { m: 2, on: true }], select: { m: current.m, on: current.on } })',
		'  result.inLoop = list.map({ items: local.rows, select: { s: demo.shift({ start: input.start, months: current.m, enabled: current.on, tags: [], options: {} }) } })',
		'  result.direct = date.add({ value: input.start, months: input.months })',
		'}',
		''
	].join("\n"));
	var engine = eval(read(new java.io.File(engineDir, "Engine.js")));
	function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }

	var run = api("flowCodeRun", { name: "Shift", input: { start: "2026-01-31", months: 3, enabled: false } });
	assert(run.ok === true, "the Flow runs: " + JSON.stringify(run).substring(0, 2000));
	var result = run.result;
	equal(result.direct, "2026-04-30", "date.add called directly");
	equal(result.literal, { shifted: "2026-07-31", months: 6, disabled: true, tagCount: 1, mode: "fast", ratio: 0.5, start: "2026-01-31" },
		"literal arguments keep their type");
	equal(result.fromInput, { shifted: "2026-04-30", months: 3, disabled: true, tagCount: 0, ratio: 0.5, start: "2026-01-31" },
		"input references are evaluated");
	equal(result.fromLocal, { shifted: "2026-04-30", months: 3, disabled: false, tagCount: 2, mode: "slow", ratio: 0.5, start: "2026-01-31" },
		"local references and expressions are evaluated");
	equal(result.inLoop.map(function (row) { return [row.s.shifted, row.s.disabled]; }), [["2026-02-28", true], ["2026-03-31", false]],
		"item references are evaluated");

	var check = api("flowCodeCheck", { name: "Shift", maxDiagnostics: 25 });
	assert(check.ok === true && !(check.diagnostics || []).some(function (d) { return d.code === "FLOWSCRIPT_PROPERTY_TYPE_MISMATCH" || d.code === "VALUE_TYPE_MISMATCH"; }),
		"the check agrees: " + JSON.stringify(check.diagnostics));
	print("block-typed-property-arguments OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
