// A project block that loses a property leaves the Flows calling it with that property uncompilable. The code tools
// still serve their repair: code-get gives the saved source with the diagnostics naming the property, code-set
// accepts the source that corrects the call, code-status and code-discard answer, and code-promote saves the repair.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-block-contract-change-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function write(file, text) { files.writeStringToFile(file, String(text), "UTF-8"); }
function read(file) { return String(files.readFileToString(file, "UTF-8")); }
function block(withDelay) {
	return [
		'const _meta = {',
		'  description: "Labels rows that are due.",',
		'  properties: {',
		'    rows: { kind: "expression", type: "array" }' + (withDelay ? ',' : ''),
		withDelay ? '    delay: { kind: "expression", type: "integer" }' : null,
		'  },',
		'  outputs: { out: { type: "array" } }',
		'}',
		'function label({ input, result }) {',
		'  return input.rows',
		'}',
		''
	].filter(function (line) { return line !== null; }).join("\n");
}
function mentionsDelay(diagnostics) {
	return [].concat(diagnostics || []).some(function (diagnostic) {
		return diagnostic.code === "UNKNOWN_BLOCK_PROPERTY" && diagnostic.property === "delay" && diagnostic.block === "demo.label" &&
			String(diagnostic.message).indexOf("delay") !== -1;
	});
}
try {
	var blockFile = new java.io.File(project, "_flow/blocks/demo/label.block.js");
	write(blockFile, block(true));
	var code = [
		'const _flow = { sourceVersion: 2, inputs: { rows: { type: "array", default: [1] } } }',
		'function Caller({ input, result }) {',
		'  result.rows = demo.label({ rows: input.rows, delay: 3 })',
		'}',
		''
	].join("\n");
	var flowFile = new java.io.File(project, "_flow/flows/Caller.flow.js");
	write(flowFile, code);
	var engine = eval(read(new java.io.File(engineDir, "Engine.js")));
	function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }

	var before = api("flowCodeGet", { name: "Caller" });
	assert(before.ok && before.code === code && before.valid === undefined, "the Flow reads before the change: " + JSON.stringify(before));

	// the block contract loses delay
	write(blockFile, block(false));
	engine.cacheClear();

	var got = api("flowCodeGet", { name: "Caller" });
	assert(got.ok === true && got.code === code && got.revision === before.revision,
		"code-get gives the saved source of a Flow that no longer compiles: " + JSON.stringify(got));
	assert(got.valid === false && mentionsDelay(got.diagnostics), "with the diagnostics naming the property: " + JSON.stringify(got.diagnostics));
	assert(String(got.next).indexOf("delay") !== -1 && String(got.next).indexOf("revision=" + got.revision) !== -1,
		"and the next step names the property and the revision: " + got.next);
	var official = api("flowCodeGet", { name: "Caller", draft: false });
	assert(official.ok === true && official.valid === false && official.code === code, "the official read as well: " + JSON.stringify(official));

	var full = api("flowSourceGet", { name: "Caller" });
	assert(full.ok === true && full.code === code && mentionsDelay(full.diagnostics), "flow-source-get reports it too: " + JSON.stringify(full));

	var checked = api("flowCodeCheck", { name: "Caller" });
	assert(checked.ok === false && JSON.stringify(checked).indexOf("delay") !== -1, "code-check still refuses it: " + JSON.stringify(checked));

	var status = api("flowCodeStatus", { name: "Caller" });
	assert(status.ok === true && status.exists === true && status.dirty === false && status.officialRevision === got.revision,
		"code-status answers: " + JSON.stringify(status));

	var fixed = code.replace(", delay: 3", "");
	var set = api("flowCodeSet", { name: "Caller", code: fixed, revision: got.revision });
	assert(set.ok === true && set.draft === true && set.oldRevision === got.revision, "code-set accepts the source that corrects the call: " + JSON.stringify(set));
	var stale = api("flowCodeSet", { name: "Caller", code: fixed, revision: "0000" + got.revision.substring(4) });
	assert(stale.ok === false && JSON.stringify(stale).indexOf("REVISION_MISMATCH") !== -1, "the revision is still checked: " + JSON.stringify(stale));

	var discarded = api("flowCodeDiscard", { name: "Caller" });
	assert(discarded.ok === true && discarded.discarded === true && discarded.exists === true && discarded.officialRevision === got.revision,
		"code-discard drops the working copy: " + JSON.stringify(discarded));
	assert(api("flowCodeGet", { name: "Caller" }).code === code, "and the saved source is active again");

	var again = api("flowCodeSet", { name: "Caller", code: fixed, revision: got.revision });
	assert(again.ok === true, "the repair is written again: " + JSON.stringify(again));
	var promoted = api("flowCodePromote", { name: "Caller" });
	assert(promoted.ok === true && read(flowFile).indexOf("delay") === -1, "code-promote saves the repair: " + JSON.stringify(promoted));
	var repaired = api("flowCodeGet", { name: "Caller" });
	assert(repaired.ok === true && repaired.valid === undefined && repaired.diagnostics === undefined, "the repaired Flow reads as before: " + JSON.stringify(repaired));
	var run = api("flowCodeRun", { name: "Caller", input: { rows: [1, 2] } });
	assert(JSON.stringify(run).indexOf("[1,2]") !== -1, "and runs: " + JSON.stringify(run));

	var missing = api("flowCodeGet", { name: "Missing" });
	assert(!missing.ok && missing.error.code === "UNKNOWN_FLOW", "a missing Flow is still unknown: " + JSON.stringify(missing));
	print("code-tools-after-block-contract-change OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
