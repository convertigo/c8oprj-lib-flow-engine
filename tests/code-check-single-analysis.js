// Read-only code access must not run analysis hooks; an explicit check still must.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-single-analysis-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var counter = new java.io.File(project, "analysis-count.txt");
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function equal(actual, expected, message) { assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual)); }
function write(file, text) { files.writeStringToFile(file, String(text), "UTF-8"); }
function read(file) { return String(files.readFileToString(file, "UTF-8")); }
try {
	write(new java.io.File(project, "_flow/blocks/proof/counted.block.js"),
		'const _meta = { runtime: "rhino", hooks: { file: "counted.hooks.js" }, properties: { value: { kind: "value", type: "string" } }, outputs: { out: { type: "string" } } }\n' +
		'(function () { return { run: function (ctx, node) { return ctx.template(ctx.props(node).value); } }; }())');
	write(new java.io.File(project, "_flow/blocks/proof/counted.hooks.js"),
		'(function () { return { analyze: function () { Packages.org.apache.commons.io.FileUtils.writeStringToFile(new java.io.File(' +
		JSON.stringify(String(counter.getAbsolutePath())) + '), ".", "UTF-8", true); } }; }())');
	var code = [
		'const _flow = { sourceVersion: 2, inputs: { name: { type: "string", default: "friend" } }, tests: { greeting: { input: { name: "Ada" } } } }',
		'function Counted({ input, result }) {',
		'  result.message = proof.counted({ value: input.name })',
		'}',
		''
	].join("\n");
	var sourceFile = new java.io.File(project, "_flow/flows/Counted.flow.js");
	write(sourceFile, code);
	var engine = eval(read(new java.io.File(engineDir, "Engine.js")));
	function call(method, request, expectedAnalyses) {
		write(counter, "");
		var out = JSON.parse(engine[method](JSON.stringify(request)));
		assert(out.ok, method + " failed: " + JSON.stringify(out));
		assert(read(counter).length === expectedAnalyses,
			method + " ran " + read(counter).length + " analysis hooks; expected " + expectedAnalyses);
		return out;
	}
	var saved = call("flowCodeGet", { name: "Counted", draft: false }, 0);
	equal(saved.code, code, "Compact read changed source");
	var full = call("flowSourceGet", { name: "Counted", draft: false }, 1);
	equal(full.revision, saved.revision, "Diagnostic read changed revision");
	assert(full.diagnostics instanceof Array, "Diagnostic read lost diagnostics");
	var officialCheck = call("flowCodeCheck", { name: "Counted", draft: false }, 1);
	var namedCheck = call("flowCodeCheck", { name: "Counted", draft: true }, 1);
	var inlineCheck = call("flowCodeCheck", { name: "Counted", code: code }, 1);
	["diagnostics", "inputDefinitions", "inputVariables", "testCases"].forEach(function (key) {
		equal(namedCheck[key], inlineCheck[key], "Named and inline check differ for " + key);
		equal(officialCheck[key], inlineCheck[key], "Official and inline check differ for " + key);
	});
	equal(namedCheck.revision, saved.revision, "Check changed saved revision");
	call("flowCodeCheck", { name: "Counted", draft: true }, 1);
	var draftCode = code.replace('default: "friend"', 'default: "draft"');
	var draft = call("flowCodeSet", { name: "Counted", code: draftCode, revision: saved.revision }, 1);
	var draftRead = call("flowCodeGet", { name: "Counted", draft: true }, 0);
	equal(draftRead.revision, draft.revision, "Draft revision changed during read");
	assert(draftRead.code.indexOf('"draft"') !== -1, "Working copy was ignored");
	var draftCheck = call("flowCodeCheck", { name: "Counted", draft: true }, 1);
	equal(draftCheck.revision, draft.revision, "Check ignored the working copy");
	var originalRead = call("flowCodeGet", { name: "Counted", draft: false }, 0);
	equal(originalRead.code, code, "Draft leaked into official source");
	equal(read(sourceFile), code, "Read/check wrote the working copy to disk");
	var invalidCode = code.replace('sourceVersion: 2', 'sourceVersion: 2, accessibility: "invalid"');
	write(sourceFile, invalidCode);
	engine.cacheClear();
	var invalidRead = JSON.parse(engine.flowCodeGet(JSON.stringify({ name: "Counted", draft: false })));
	assert(invalidRead.ok && invalidRead.code === invalidCode, "Invalid source could not be read for repair: " + JSON.stringify(invalidRead));
	var invalidFull = JSON.parse(engine.flowSourceGet(JSON.stringify({ name: "Counted", draft: false })));
	assert(invalidFull.ok && JSON.stringify(invalidFull.diagnostics).indexOf("FLOW_ACCESSIBILITY_INVALID") !== -1,
		"Diagnostic source read no longer reports invalid metadata: " + JSON.stringify(invalidFull));
	var invalidCheck = JSON.parse(engine.flowCodeCheck(JSON.stringify({ name: "Counted", draft: false })));
	assert(!invalidCheck.ok && JSON.stringify(invalidCheck).indexOf("FLOW_ACCESSIBILITY_INVALID") !== -1,
		"Named check skipped semantic validation: " + JSON.stringify(invalidCheck));
	write(sourceFile, code.replace('value: input.name', 'unknownProperty: input.name'));
	engine.cacheClear();
	var invalidCanonical = JSON.parse(engine.flowCodeGet(JSON.stringify({ name: "Counted", draft: false })));
	assert(!invalidCanonical.ok && invalidCanonical.error.code === "FLOWSCRIPT_CANONICAL_INVALID",
		"Canonical source validation was bypassed: " + JSON.stringify(invalidCanonical));
	var missing = JSON.parse(engine.flowCodeGet(JSON.stringify({ name: "Missing", draft: false })));
	assert(!missing.ok && missing.error.code === "UNKNOWN_FLOW", "Missing Flow error changed");
	print("code-check-single-analysis OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
