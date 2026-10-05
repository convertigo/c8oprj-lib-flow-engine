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
	// default, then B1 and Mail (first tag), then B2 (last tag), merged value by value; the Flow default keeps its own root keys.
	equal(run.result.snapshot, {api: {host: "two", commonOnly: true, token: "not-for-the-picker", port: 42}, flowOnly: 1, common: true,
		flag: null, smtp: {host: "mail"}}, "Named configurations merge over default value by value, the last tag winning");
	function treeNode(nodes, path) {
		for (var i = 0; i < (nodes || []).length; i++) {
			if (nodes[i].path === path) return nodes[i];
			var found = treeNode(nodes[i].children, path);
			if (found) return found;
		}
		return null;
	}
	var flowTree = api("describeTree", {target: "flow", flowSource: source, flowQName: "Proof.Sample", tagContext: tagContext, includeFlowCatalog: false});
	var effectiveHost = treeNode(flowTree.children, "effectiveConfig.api.host");
	assert(effectiveHost && effectiveHost.summary === "host: two (B2 (tag a-last))", "Effective value with its origin: " + JSON.stringify(effectiveHost && effectiveHost.summary));
	var commonOnly = treeNode(flowTree.children, "effectiveConfig.api.commonOnly");
	assert(commonOnly && commonOnly.summary === "commonOnly: true (default)", "A value kept from default: " + JSON.stringify(commonOnly && commonOnly.summary));
	var flowOnly = treeNode(flowTree.children, "effectiveConfig.flowOnly");
	assert(flowOnly && flowOnly.summary.indexOf("(Flow default)") !== -1, "A Flow default keeps its origin");
	var effective = treeNode(flowTree.children, "effectiveConfig");
	assert(effective && JSON.parse(effective.info).sourceWritable === false, "The effective configuration is read-only");
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
	// A private key stays private in the named configurations too, in their tree and in the effective configuration.
	var privateDefinition = JSON.parse(JSON.stringify(definition)); privateDefinition.configVisibility = {"api.token": "private"};
	var engineTree = api("describeTree", {target: "engine", engineSource: JSON.stringify(privateDefinition), includeFlowCatalog: false});
	assert(treeNode(engineTree.children, "configs.B1.api.host") && !treeNode(engineTree.children, "configs.B1.api.token"),
		"A private key of a named configuration is hidden");
	var privateDrafts = {}; privateDrafts[String(file.getCanonicalPath())] = JSON.stringify(privateDefinition);
	var privateTree = api("describeTree", {target: "flow", flowSource: source, flowQName: "Proof.Sample", tagContext: tagContext,
		includeFlowCatalog: false, sourceDrafts: privateDrafts});
	var token = treeNode(privateTree.children, "effectiveConfig.api.token");
	assert(token && token.summary.indexOf("(private)") !== -1 && JSON.stringify(privateTree).indexOf("not-for-the-picker") === -1,
		"The effective configuration masks a private value: " + JSON.stringify(token && token.summary));
	// Only what a mutation breaks is refused: an older broken reference no longer blocks an unrelated edit.
	var stale = JSON.parse(JSON.stringify(tagContext)); stale.tags["z-first"].metadata.flow.configs = ["B1", "ghost"];
	var unrelated = api("applyMutation", {target: "engine", engineSource: JSON.stringify(definition), tagContext: stale, includeTree: false,
		mutation: {op: "replace", path: "config.common", value: false}});
	assert(unrelated.ok, "An unrelated engine edit is not blocked by an older broken reference: " + JSON.stringify(unrelated).substring(0, 300));
	var reserved = api("applyMutation", {target: "engine", engineSource: JSON.stringify(definition), tagContext: tagContext, includeTree: false,
		mutation: {op: "renameKey", path: "configs.B2", value: "default"}});
	assert(!reserved.ok && reserved.error.code === "FLOW_CONFIG_NAME_RESERVED", "default is reserved for the common configuration: " + JSON.stringify(reserved).substring(0, 300));
	// A Flow run from another Flow on the direct requestable path gets its own identity and the tag context of its project:
	// its configurations follow its tags, like a regular call, without inheriting the caller's.
	files.writeStringToFile(new java.io.File(project, "_flow/flows/Child.flow.js"),
		"const _flow={sourceVersion:2}\nfunction Child(){ result.snapshot = config }", "UTF-8");
	files.writeStringToFile(new java.io.File(project, "_flow/blocks/proof/callChild.block.js"), [
		"const _meta = {", "  \"sourceVersion\": 2,", "  \"version\": 1,", "  \"icon\": \"mdi:variable\",",
		"  \"description\": \"Runs the Child Flow as requestable.call does on its direct path.\",",
		"  \"properties\": { \"flowQName\": { \"label\": \"Flow QName\", \"kind\": \"text\", \"type\": \"string\" } },",
		"  \"outputs\": { \"out\": { \"type\": \"object\" } },", "  \"runtime\": \"rhino\",", "}", "",
		"(function () {", "\treturn {", "\t\trun: function (ctx, node) {",
		"\t\t\tvar flowQName = ctx.props(node).flowQName;",
		"\t\t\tvar execution = ctx.runFlowSource(ctx.flowGet(\"Child\").source, {}, { project: \"Proof\", input: {}, includeTrace: false,",
		"\t\t\t\tflowQName: flowQName || undefined, tagContext: flowQName ? ctx.request.tagContext : undefined });",
		"\t\t\treturn execution.ok ? execution.result.snapshot : { error: execution.error };",
		"\t\t}", "\t};", "}())", ""].join("\n"), "UTF-8");
	engine.cacheClear();
	var callerSource = "const _flow={sourceVersion:2}\nfunction Caller(){\n  result.tagged = proof.callChild({ $$id: \"tagged\", flowQName: \"Proof.Sample\" })\n"
		+ "  result.plain = proof.callChild({ $$id: \"plain\" })\n}";
	var caller = api("run", {flowSource: callerSource, flowQName: "Proof.Caller", tagContext: tagContext, includeTrace: false});
	assert(caller.ok && caller.result.tagged.api.host === "one" && caller.result.tagged.smtp.host === "mail",
		"A Flow run from another Flow did not get the configurations of its own tags: " + JSON.stringify(caller).substring(0, 400));
	assert(caller.result.plain.api.host === "common" && caller.result.plain.smtp === undefined,
		"A Flow run without its identity selected tagged configurations: " + JSON.stringify(caller.result.plain));
	// A code tool called from a running Flow (the MCP server Flow) reads the working copies of its own prepared
	// request, not those of the running Flow: a named configuration still in draft resolves for the tag selecting it.
	var draftDefinition = JSON.parse(JSON.stringify(definition)); draftDefinition.configs.Draft = {api: {host: "draft config"}};
	var configDrafts = {}; configDrafts[String(file.getCanonicalPath())] = JSON.stringify(draftDefinition);
	var draftTagContext = JSON.parse(JSON.stringify(tagContext));
	draftTagContext.tags["with-draft"] = {metadata: {flow: {configs: ["Draft"]}}};
	draftTagContext.assignments["Proof.sq:Sample"].push("with-draft");
	files.writeStringToFile(new java.io.File(project, "_flow/blocks/proof/codeRunDraft.block.js"), [
		"const _meta = {", "  \"sourceVersion\": 2,", "  \"version\": 1,", "  \"icon\": \"mdi:variable\",",
		"  \"description\": \"Runs Sample through the code-run tool with a prepared request, as the MCP server Flow does.\",",
		"  \"properties\": {},", "  \"outputs\": { \"out\": { \"type\": \"object\" } },", "  \"runtime\": \"rhino\",", "}", "",
		"(function () {", "\treturn {", "\t\trun: function (ctx, node) {",
		"\t\t\tvar execution = ctx.flowCodeRun(" + JSON.stringify({qname: "Proof.Sample", code: source, tagContext: draftTagContext,
			frontendSourceDrafts: configDrafts, includeTrace: false}) + ");",
		"\t\t\treturn execution.ok ? execution.result.snapshot : { error: execution.error };",
		"\t\t}", "\t};", "}())", ""].join("\n"), "UTF-8");
	engine.cacheClear();
	var toolCaller = api("run", {flowSource: "const _flow={sourceVersion:2}\nfunction ToolCaller(){\n  result.snapshot = proof.codeRunDraft({ $$id: \"probe\" })\n}",
		flowQName: "Proof.ToolCaller", tagContext: tagContext, includeTrace: false});
	assert(toolCaller.ok && toolCaller.result.snapshot && toolCaller.result.snapshot.api && toolCaller.result.snapshot.api.host === "draft config",
		"A code tool called from a running Flow ignored the draft configuration of its request: " + JSON.stringify(toolCaller).substring(0, 400));
	// An unreadable tag source (no valid state ever read): memberships are unknown.
	var unreadable = {project: "Proof", diagnostic: "Unexpected character", tags: {}, assignments: {}, aliases: {}};
	var blocked = api("run", Object.assign({}, request, {tagContext: unreadable}));
	assert(!blocked.ok && JSON.stringify(blocked).indexOf("FLOW_TAGS_UNAVAILABLE") !== -1, "An unreadable tag source silently selected no configuration");
	var plain = JSON.parse(JSON.stringify(definition)); delete plain.configs;
	var plainDrafts = {}; plainDrafts[String(file.getCanonicalPath())] = JSON.stringify(plain);
	var unaffected = api("run", Object.assign({}, request, {tagContext: unreadable, sourceDrafts: plainDrafts}));
	assert(unaffected.ok && unaffected.result.snapshot.api.host === "common",
		"A project without named configurations must not depend on its tags: " + JSON.stringify(unaffected));
	var kept = api("run", Object.assign({}, request, {tagContext: Object.assign({}, tagContext, {warning: "Unexpected character (the last valid tags stay in use)"})}));
	assert(kept.ok && kept.result.snapshot.api.host === "one", "The last valid tags must keep serving: " + JSON.stringify(kept));
	tagContext.tags["z-first"].metadata.flow.configs = ["absent"];
	var invalid = api("run", request);
	assert(!invalid.ok && JSON.stringify(invalid).indexOf("FLOW_CONFIG_REFERENCE_NOT_FOUND") !== -1, "Missing references must not silently fall back");
	tagContext.tags["z-first"].metadata.flow.configs = "B1";
	assert(JSON.stringify(api("context", request)).indexOf("FLOW_CONFIG_REFERENCES_ARRAY_REQUIRED") !== -1, "Malformed reference list accepted");
	print("tag-project-configs OK (" + checks + " checks)");
} finally { files.deleteDirectory(project); }
