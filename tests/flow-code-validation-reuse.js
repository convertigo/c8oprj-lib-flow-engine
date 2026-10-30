// A FlowScript checked once is not analysed again for the same code and revisions: code-set, code-check, code-run and
// code-promote of one working copy check it once (2 analyses for the cycle instead of 5, the save of the promotion
// analysing the saved Flow) and answer what a fresh check answers; a change of what the check
// reads (the code, a block, the configuration, the schemas, a saved Flow, another working copy, a cache clear) checks
// again. The working copies of the Flows stay out of the key of the block catalog: a Flow edit reuses the catalog, a
// block edit does not. Requests carry the Flow working copy as a server prepares them (frontendSourceDrafts).
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-validation-reuse-").toFile().getCanonicalFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var counter = new java.io.File(project, "analysis-count.txt");
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function write(file, text) { files.writeStringToFile(file, String(text), "UTF-8"); }
function read(file) { return String(files.readFileToString(file, "UTF-8")); }
try {
	var blockFile = new java.io.File(project, "_flow/blocks/proof/counted.block.js");
	var blockSource = 'const _meta = { runtime: "rhino", description: "Counted.", hooks: { file: "counted.hooks.js" }, properties: { value: { kind: "value", type: "string" } }, outputs: { out: { type: "string" } } }\n' +
		'(function () { return { run: function (ctx, node) { return ctx.template(ctx.props(node).value); } }; }())';
	write(blockFile, blockSource);
	write(new java.io.File(project, "_flow/blocks/proof/counted.hooks.js"),
		'(function () { return { analyze: function () { Packages.org.apache.commons.io.FileUtils.writeStringToFile(new java.io.File(' +
		JSON.stringify(String(counter.getAbsolutePath())) + '), ".", "UTF-8", true); } }; }())');
	function code(word) {
		return [
			'const _flow = { sourceVersion: 2, inputs: { name: { type: "string", default: "friend" } } }',
			'function Counted({ input, result }) {',
			'  result.message = proof.counted({ value: "' + word + ' " + input.name })',
			'}',
			''
		].join("\n");
	}
	var flowFile = new java.io.File(project, "_flow/flows/Counted.flow.js");
	write(flowFile, code("Saved"));
	var engine = eval(read(new java.io.File(engineDir, "Engine.js")));
	function drafts(text, extra) {
		var map = {};
		map[String(flowFile.getCanonicalPath())] = text;
		Object.keys(extra || {}).forEach(function (path) { map[path] = extra[path]; });
		return map;
	}
	function call(method, request, expectedAnalyses, message) {
		write(counter, "");
		var out = JSON.parse(engine[method](JSON.stringify(request)));
		assert(out.ok !== false || request.expectFailure, method + " failed: " + JSON.stringify(out).substring(0, 1200));
		assert(read(counter).length === expectedAnalyses, (message || method) + ": " + read(counter).length + " analyses instead of " + expectedAnalyses);
		return out;
	}
	function blockCatalogMisses() {
		var info = JSON.parse(engine.cacheInfo());
		var caches = info.caches || info.result && info.result.caches || {};
		return Number(caches.blocks && caches.blocks.misses || 0);
	}

	// 1. One edit cycle analyses its working copy once; each answer is the one of a fresh check.
	var current = code("Hello");
	var set = call("flowCodeSet", { name: "Counted", code: current, frontendSourceDrafts: drafts(current) }, 1, "code-set");
	var request = { name: "Counted", draft: true, frontendSourceDrafts: drafts(current) };
	call("flowCodeGet", request, 0, "code-get");
	var checked = call("flowCodeCheck", request, 0, "code-check after code-set");
	var run = call("flowCodeRun", Object.assign({ input: { name: "Ada" }, includeTrace: false }, request), 0, "code-run after code-check");
	assert(run.result.message === "Hello Ada", "the run of a kept check lost its result: " + JSON.stringify(run.result));
	// The same check by an engine that kept nothing (another instance): the same answers.
	var inline = { name: "Counted", code: current, frontendSourceDrafts: drafts(current) };
	var kept = JSON.parse(engine.flowCodeCheck(JSON.stringify(inline)));
	assert(JSON.stringify(call("flowCodeCheck", inline, 0, "code-check of inline code again")) === JSON.stringify(kept), "a kept inline check changed");
	var freshEngine = eval(read(new java.io.File(engineDir, "Engine.js")));
	write(counter, "");
	var fresh = JSON.parse(freshEngine.flowCodeCheck(JSON.stringify(inline)));
	assert(read(counter).length === 1 && JSON.stringify(fresh) === JSON.stringify(kept),
		"a kept check differs from a fresh one:\n" + JSON.stringify(kept) + "\n" + JSON.stringify(fresh));
	var keptRun = call("flowCodeRun", Object.assign({ input: { name: "Ada" }, includeTrace: false }, inline), 0, "code-run of inline code after its check");
	var freshRun = JSON.parse(freshEngine.flowCodeRun(JSON.stringify(Object.assign({ input: { name: "Ada" }, includeTrace: false }, inline))));
	["ok", "result", "warnings", "inputDefinitions", "inputVariables", "revision", "draft", "qname"].forEach(function (key) {
		assert(JSON.stringify(freshRun[key]) === JSON.stringify(keptRun[key]), "a run after a kept check differs in " + key + ": " +
			JSON.stringify(keptRun[key]) + " / " + JSON.stringify(freshRun[key]));
	});
	// The save of the promotion analyses the saved Flow once (as before); its check is the kept one.
	var promoted = call("flowCodePromote", { name: "Counted", revision: set.revision, frontendSourceDrafts: drafts(current) }, 1, "code-promote of the checked revision");
	assert(promoted.promoted === true && read(flowFile).indexOf("Hello") !== -1, "the promotion was not written: " + JSON.stringify(promoted).substring(0, 600));

	// 2. A new code is checked again, once.
	current = code("Hi");
	call("flowCodeSet", { name: "Counted", code: current, frontendSourceDrafts: drafts(current) }, 1, "code-set of a new code");
	request = { name: "Counted", draft: true, frontendSourceDrafts: drafts(current) };
	call("flowCodeCheck", request, 0, "code-check of the new code");

	// 3. The block catalog: a Flow edit reuses it, a block working copy rebuilds it and checks again.
	var misses = blockCatalogMisses();
	for (var edit = 0; edit < 3; edit++) {
		var edited = code("Edit" + edit);
		call("flowCodeSet", { name: "Counted", code: edited, frontendSourceDrafts: drafts(edited) }, 1, "code-set of edit " + edit);
	}
	assert(blockCatalogMisses() === misses, "a Flow edit loaded the block catalog again: " + misses + " -> " + blockCatalogMisses());
	current = code("Edit2");
	request = { name: "Counted", draft: true, frontendSourceDrafts: drafts(current) };
	call("flowCodeCheck", request, 0, "code-check after Flow edits");
	var blockDraft = {};
	blockDraft[String(blockFile.getCanonicalPath())] = blockSource.replace('description: "Counted."', 'description: "Counted, edited."');
	var withBlock = { name: "Counted", draft: true, frontendSourceDrafts: drafts(current, blockDraft) };
	call("flowCodeCheck", withBlock, 1, "code-check with a block working copy");
	assert(blockCatalogMisses() > misses, "a block working copy did not load the block catalog again");
	call("flowCodeCheck", withBlock, 0, "code-check again with the same block working copy");

	// 4. What the analysis reads besides the code checks again: another working copy, a saved Flow, the schemas, the
	// configuration, a cache clear; the working copy of the checked Flow itself does not.
	var otherFlow = String(new java.io.File(project, "_flow/flows/Other.flow.js").getCanonicalPath());
	var otherDraft = {};
	otherDraft[otherFlow] = 'function Other({ result }) {\n  result.value = 1\n}\n';
	call("flowCodeCheck", { name: "Counted", draft: true, frontendSourceDrafts: drafts(current, otherDraft) }, 1, "code-check with another Flow working copy");
	call("flowCodeCheck", { name: "Counted", draft: true, frontendSourceDrafts: drafts(current, otherDraft) }, 0, "code-check again with it");
	engine.flowCodeCheck(JSON.stringify({ name: "Counted", code: current, frontendSourceDrafts: drafts(current) }));
	call("flowCodeCheck", { name: "Counted", code: current, frontendSourceDrafts: drafts(code("Unrelated draft")) }, 0,
		"code-check of the same code whatever the working copy of the checked Flow");
	write(new java.io.File(project, "_flow/flows/Saved.flow.js"), 'function Saved({ result }) {\n  result.value = 2\n}\n');
	call("flowCodeCheck", request, 1, "code-check after another Flow was saved");
	call("flowCodeCheck", request, 0, "code-check again after it");
	var savedPath = String(new java.io.File(project, "_flow/flows/Saved.flow.js").getCanonicalPath());
	call("flowCodeCheck", Object.assign({ sourceRemovals: [savedPath] }, request), 1, "code-check with another Flow removed in the working copies");
	write(new java.io.File(project, "_flow/schemas/learned.schema.json"), '{"type":"object"}');
	call("flowCodeCheck", request, 1, "code-check after a schema was written");
	write(new java.io.File(project, "_flow/engine.yaml"), "config:\n  greeting: Hello\n");
	call("flowCodeCheck", request, 1, "code-check after a configuration change");
	call("flowCodeCheck", request, 0, "code-check again after it");
	engine.cacheClear();
	call("flowCodeCheck", request, 1, "code-check after a cache clear");
	var bridge = Packages.com.twinsoft.convertigo.engine.flow.FlowEngineBridge;
	if (typeof bridge.dataGeneration === "function" && typeof bridge.invalidateProjectDataCaches === "function") {
		bridge.invalidateProjectDataCaches(String(project.getAbsolutePath()));
		call("flowCodeCheck", request, 1, "code-check after a data change Convertigo was told about");
	}
	call("flowCodeCheck", Object.assign({ maxDiagnostics: 3 }, request), 1, "code-check with other options");

	// 5. Authoring corrections only raise repeated external calls to an error: a check with them answers a check without
	// them when its report has none, and not otherwise.
	var repeated = [
		'const _flow = { sourceVersion: 2 }',
		'function Counted({ input, result }) {',
		'  local.a = http.get({ url: "https://example.com/a" })',
		'  local.b = http.get({ url: "https://example.com/b" })',
		'  local.c = http.get({ url: "https://example.com/c" })',
		'  local.d = http.get({ url: "https://example.com/d" })',
		'  result.message = proof.counted({ value: "x" })',
		'}',
		''
	].join("\n");
	var refused = call("flowCodeSet", { name: "Counted", code: repeated, frontendSourceDrafts: drafts(repeated), expectFailure: true }, 0,
		"code-set of repeated calls (refused before its analysis)");
	assert(refused.ok === false && JSON.stringify(refused).indexOf("FLOWSCRIPT_REPEATED_EXTERNAL_CALLS") !== -1,
		"code-set did not refuse repeated external calls: " + JSON.stringify(refused).substring(0, 600));
	var warned = call("flowCodeCheck", { name: "Counted", draft: true, frontendSourceDrafts: drafts(repeated) }, 1,
		"code-check of repeated calls checks again without corrections");
	assert(warned.ok === true && warned.warnings.some(function (warning) { return warning.code === "FLOWSCRIPT_REPEATED_EXTERNAL_CALLS"; }),
		"code-check did not warn about repeated calls: " + JSON.stringify(warned).substring(0, 600));
	print("flow-code-validation-reuse OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
