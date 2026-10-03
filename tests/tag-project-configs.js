// The same effective config drives runtime, static analysis and property pickers.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-tag-configs-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function equal(actual, expected, message) { assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual)); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
	var definition = {version: 1, config: {api: {host: "common", commonOnly: true}, common: true}, configs: {
		B1: {api: {host: "one", token: "not-for-the-picker"}, flag: false},
		B2: {api: {host: "two", port: 42}, flag: null}, Mail: {smtp: {host: "mail"}}
	}};
	var file = new java.io.File(project, "_flow/engine.yaml");
	files.writeStringToFile(file, JSON.stringify(definition), "UTF-8");
	var tagContext = {project: "Proof", aliases: {"Proof.Sample": "Proof.sq:Sample"}, assignments: {
		"Proof.sq:Sample": ["z-first", "a-last"]
	}, tags: {
		"z-first": {metadata: {flow: {configs: ["B1", "Mail"]}}},
		"a-last": {metadata: {flow: {configs: ["B2"]}}}
	}};
	var source = "const _flow={sourceVersion:2, config:{api:{host:'flow default'},flowOnly:1}}\nfunction Sample(){ result.snapshot = config }";
	var request = {flowSource: source, flowQName: "Proof.Sample", tagContext: tagContext, includeTrace: false};
	var descriptor = api("tagContribution", {}).descriptor;
	equal(descriptor.fields.configs.items.enum, ["B1", "B2", "Mail"], "Descriptor publishes names only");
	assert(JSON.stringify(descriptor).indexOf("not-for-the-picker") === -1, "Descriptor leaked config values");
	var run = api("run", request);
	assert(run.ok, "Tagged runtime failed: " + JSON.stringify(run));
	equal(run.result.snapshot, {api: {host: "two", port: 42}, flowOnly: 1, common: true, flag: null, smtp: {host: "mail"}},
		"Last tag wins, entire root branch replaced, unrelated branches retained");
	[ {qname:"Proof.Sample"}, {project:"Proof",name:"Sample"} ].forEach(function (target) {
		var toolRequest = Object.assign({code:source,tagContext:tagContext,includeTrace:false}, target);
		var codeRun = api("flowCodeRun", toolRequest);
		assert(codeRun.ok && codeRun.result.snapshot.api.host === "two", "Code-run lost the target's tag configuration: " + JSON.stringify(codeRun));
		var codeAnalysis = api("flowCodeAnalyze", toolRequest);
		assert(codeAnalysis.ok && JSON.stringify(codeAnalysis).indexOf('"port"') !== -1, "Code-analyze lost the target's config schema");
	});
	tagContext.assignments["Proof.sq:Sample"].reverse();
	run = api("run", request);
	assert(run.ok && run.result.snapshot.api.host === "one" && run.result.snapshot.flag === false, "Runtime ignored draft tag order");
	var overridden = api("run", Object.assign({}, request, {config: {api: {host: "explicit"}, flag: 0}}));
	assert(overridden.ok && overridden.result.snapshot.api.host === "explicit" && overridden.result.snapshot.flag === 0,
		"Explicit call config must win over tags, including falsy values");
	var none = api("run", Object.assign({}, request, {flowQName: "Proof.Other"}));
	assert(none.ok && none.result.snapshot.api.host === "common" && none.result.snapshot.flag === undefined, "Unassigned Flow inherited another Flow's tags");
	var draft = JSON.parse(JSON.stringify(definition)); draft.configs.B1.api.host = "engine-draft"; draft.configs.B1.api.addedInDraft = 123;
	var drafts = {}; drafts[String(file.getCanonicalPath())] = JSON.stringify(draft);
	var preview = api("run", Object.assign({}, request, {sourceDrafts: drafts}));
	assert(preview.ok && preview.result.snapshot.api.host === "engine-draft", "Runtime ignored engine source draft");
	assert(api("run", request).result.snapshot.api.host === "one", "Draft leaked into saved engine source");
	var context = api("context", Object.assign({}, request, {sourceDrafts: drafts}));
	assert(context.ok && JSON.stringify(context).indexOf("addedInDraft") !== -1, "Picker did not use the runtime's winning config schema");
	assert(JSON.stringify(context).indexOf("not-for-the-picker") === -1, "Picker leaked config values");
	var analysis = api("analyze", Object.assign({}, request, {sourceDrafts: drafts}));
	assert(analysis.ok && JSON.stringify(analysis).indexOf("addedInDraft") !== -1, "Static analysis did not use tagged config");
	["remove", "renameKey"].forEach(function (op) {
		var changed = api("applyMutation", {target: "engine", engineSource: JSON.stringify(definition), tagContext: tagContext,
			includeTree: false, mutation: {op: op, path: "configs.B1", value: "Renamed"}});
		assert(!changed.ok && changed.error.code === "FLOW_CONFIG_IN_USE", "Referenced definition was silently removed/renamed");
	});
	assert(String(files.readFileToString(file, "UTF-8")) === JSON.stringify(definition), "Rejected referenced mutation touched disk");
	tagContext.tags["z-first"].metadata.flow.configs = ["absent"];
	var invalid = api("run", request);
	assert(!invalid.ok && JSON.stringify(invalid).indexOf("FLOW_CONFIG_REFERENCE_NOT_FOUND") !== -1, "Missing references must not silently fall back");
	tagContext.tags["z-first"].metadata.flow.configs = "B1";
	assert(JSON.stringify(api("context", request)).indexOf("FLOW_CONFIG_REFERENCES_ARRAY_REQUIRED") !== -1, "Malformed reference list accepted");
	print("tag-project-configs OK (" + checks + " checks)");
} finally { files.deleteDirectory(project); }
