// A project block property that declares only a type keeps receiving the value of its argument through warm caches:
// after its block or the engine is updated and the engine is evaluated again, without any cache clear. The caches that
// outlive an evaluation in a server JVM (the shared source memo, the compiled scripts) must not serve the reading of
// the previous engine: warmed by an engine that still read the text of the argument, the updated engine reads values.
var engineSource = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var File = java.io.File;
var files = Packages.org.apache.commons.io.FileUtils;
var temp = java.nio.file.Files.createTempDirectory("flow-typed-property-warm-cache-").toFile().getCanonicalFile();
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function equal(actual, expected, message) { assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual) + " instead of " + JSON.stringify(expected)); }
function write(file, text) { files.writeStringToFile(file, String(text), "UTF-8"); }
function read(file) { return String(files.readFileToString(file, "UTF-8")); }
try {
	// an engine of its own, updated in place as a deployment does
	var engineRoot = new File(temp, "lib_flow_engine/_flow");
	files.copyDirectory(engineSource, engineRoot);
	var project = new File(temp, "Consumer");
	var __flowEngineDir = String(engineRoot.getAbsolutePath());
	var __flowProjectDir = String(project.getAbsolutePath());
	var blockFile = new File(project, "_flow/blocks/demo/shift.block.js");
	function block(version) {
		return [
			'const _meta = {',
			'  "sourceVersion": 2,',
			'  "description": "Shifts a date by a number of months.",',
			'  "properties": { "start": { "type": "string" }, "months": { "type": "integer" }, "enabled": { "type": "boolean" } },',
			'  "outputs": { "out": { "type": "object", "properties": { "shifted": { "type": "string" }, "months": { "type": "integer" }, "disabled": { "type": "boolean" }, "version": { "type": "string" } } } }',
			'}',
			'function shift({ input, config, result }) {',
			'  local.shifted = date.add({ value: input.start, months: input.months })',
			'  return { shifted: local.shifted, months: input.months, disabled: !input.enabled, version: "' + version + '" }',
			'}',
			''
		].join("\n");
	}
	write(blockFile, block("one"));
	write(new File(project, "_flow/flows/Shift.flow.js"), [
		'const _flow = { sourceVersion: 2, inputs: { months: { type: "integer", default: 3 }, enabled: { type: "boolean", default: false } } }',
		'function Shift({ input, result }) {',
		'  result.literal = demo.shift({ start: "2026-01-31", months: 6, enabled: false })',
		'  result.fromInput = demo.shift({ start: "2026-01-31", months: input.months, enabled: input.enabled })',
		'}',
		''
	].join("\n"));
	// a new evaluation of the engine, as after a deployment: never a cache clear
	function load() { return eval(read(new File(engineRoot, "Engine.js"))); }
	function run(engine) {
		var out = JSON.parse(engine.flowCodeRun(JSON.stringify({ name: "Shift", draft: false, input: { months: 3, enabled: false }, includeTrace: false })));
		assert(out.ok === true, "the Flow runs: " + JSON.stringify(out).substring(0, 1500));
		return out.result;
	}
	function values(result, version, message) {
		equal(result.literal, { shifted: "2026-07-31", months: 6, disabled: true, version: version }, message + ", literal arguments");
		equal(result.fromInput, { shifted: "2026-04-30", months: 3, disabled: true, version: version }, message + ", input arguments");
	}

	// warmed by the reading before the fix: the type of the property taken as its kind
	var moduleFile = new File(engineRoot, "modules/graph-block-runtime-service.js");
	var fixedModule = read(moduleFile);
	var previousModule = fixedModule.replace("\tfunction propertyKind(descriptor) {\n",
		"\tfunction propertyKind(descriptor) {\n\t\treturn String(descriptor && (descriptor.kind || descriptor.type) || \"\");\n");
	assert(previousModule !== fixedModule, "the reading before the fix can be rebuilt");
	write(moduleFile, previousModule);
	var engine = load();
	var before = run(engine);
	run(engine);
	equal(before.literal, { shifted: null, months: "6", disabled: false, version: "one" }, "the warm caches hold the reading before the fix");

	// the engine is updated in place, then evaluated again without a cache clear
	write(moduleFile, fixedModule);
	engine = load();
	values(run(engine), "one", "the updated engine reads values");
	values(run(engine), "one", "and again from its warm caches");

	// the block is updated: the running engine and a new evaluation read values
	write(blockFile, block("two"));
	values(run(engine), "two", "the updated block, in the running engine");
	engine = load();
	values(run(engine), "two", "the updated block, after a new evaluation");

	// the engine is updated again without changing the reading: still values
	write(moduleFile, fixedModule + "\n// deployed again\n");
	engine = load();
	values(run(engine), "two", "an engine deployed again");
	print("block-typed-property-warm-cache OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(temp);
}
