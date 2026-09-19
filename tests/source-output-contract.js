// Traverse the real Engine: engine output routing must not become business input.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "libs/flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-output-contract-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function same(actual, expected, message) { assert(JSON.stringify(actual) === JSON.stringify(expected), message + ": " + JSON.stringify(actual)); }
function write(path, text) { files.writeStringToFile(new java.io.File(project, path), text, "UTF-8"); }
try {
	write("libs/flow/blocks/proof/record.block.js", 'const _meta = ' + JSON.stringify({
		runtime: "rhino", properties: { id: { kind: "value", type: "number" }, out: { kind: "value", type: "string" }, "$$id": { kind: "value", type: "number" } },
		outputs: { out: { type: "object", properties: { id: { type: "number" }, out: { type: "string" } } } }
	}) + '\n(function () { return { run: function (ctx, node) { return ctx.template(ctx.props(node)); } }; }())');
	write("libs/flow/blocks/proof/invoke.block.js", 'const _meta = { runtime: "rhino", properties: {} }\n' +
		'(function () { return { run: function (ctx) { var value = ctx.callBlock("proof.record", { id: 7, out: "result.decoy" }, { out: "result.real" }); return value; } }; }())');
	write("libs/flow/blocks/proof/legacy.block.js", 'const _meta = { runtime: "flow", properties: {} }\n' +
		'function Legacy() {\nresult.id = 7\n}');
	write("libs/flow/blocks/proof/holder.block.js", 'const _meta = { runtime: "flow", properties: {}, slots: { nodes: { accepts: ["flow.node"] } } }\n' +
		'function Holder() {\nresult.id = 7\n}');
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { request.flowName = "OutputProof"; return JSON.parse(engine[name](JSON.stringify(request))); }
	function source(call) { return 'const _flow = { sourceVersion: 2 }\nfunction OutputProof() {\n' + call + '\nobject.keys({ $$id: "keys", $$out: "result.keys", source: local.record })\n}'; }
	var code = source('proof.record({ $$id: "record", $$out: "local.record", id: 5, out: "result.decoy" })');
	var analyzed = api("analyze", { flowSource: code });
	assert(analyzed.ok, "Analysis failed: " + JSON.stringify(analyzed));
	assert(analyzed.writes.indexOf("local.record") !== -1, "Analysis lost engine output: " + JSON.stringify(analyzed));
	assert(analyzed.writes.indexOf("result.decoy") === -1, "Analysis wrote business output: " + JSON.stringify(analyzed));
	assert(analyzed.schemas["local.record"].properties.id.type === "number", "Declared schema was not routed to the engine output");
	var picked = api("context", { flowSource: code, node: "keys", property: "source", detail: "compact", include: ["local", "result"] });
	assert(picked.ok, "Picker failed: " + JSON.stringify(picked));
	var pickedJson = JSON.stringify(picked);
	assert(pickedJson.indexOf("local.record.id") !== -1 && pickedJson.indexOf("result.decoy") === -1, "Picker source/routing collision: " + pickedJson);
	var ran = api("run", { flowSource: code, includeTrace: false });
	assert(ran.ok, "Runtime failed: " + JSON.stringify(ran));
	same(ran.result.keys.sort(), ["id", "out"], "Runtime lost business fields");
	var noBusiness = api("run", { flowSource: code.replace(', out: "result.decoy"', ''), includeTrace: false });
	same(noBusiness.result.keys, ["id"], "Engine output leaked into business inputs");
	var noRoute = api("analyze", { flowSource: source('proof.record({ $$id: "record", id: 5, out: "result.decoy" })') });
	assert(noRoute.writes.indexOf("result.decoy") === -1, "Business output without engine route was treated as a write");
	var invoke = api("run", { flowSource: source('proof.invoke({ $$id: "record", $$out: "local.record" })'), includeTrace: false });
	assert(invoke.ok && invoke.result.real.id === 7 && invoke.result.real.out === "result.decoy" && !invoke.result.decoy, "callBlock options/payload collision: " + JSON.stringify(invoke));
	var afterLegacy = api("run", { flowSource: code.replace('proof.record(', function () { return 'proof.legacy({ $$id: "legacy", $$out: "result.legacy" })\nproof.record('; }).replace(', out: "result.decoy"', ''), includeTrace: false });
	assert(afterLegacy.ok && afterLegacy.result.legacy.id === 7, "Nested legacy Flow failed: " + JSON.stringify(afterLegacy));
	same(afterLegacy.result.keys, ["id"], "Nested Flow did not restore caller dialect");
	var metadataPicker = api("context", { flowSource: code, node: "record", property: "$$out", detail: "compact" });
	assert(metadataPicker.target.propertyDefinition.kind === "path" && metadataPicker.target.propertyDefinition.mode === "write", "Output picker lost its path editor");
	var businessPicker = api("context", { flowSource: code, node: "record", property: "out", detail: "compact" });
	assert(businessPicker.target.propertyDefinition.kind === "value", "Business output picker uses engine editor");
	var escapedPicker = api("context", { flowSource: code, node: "record", property: "$$$id", detail: "compact" });
	assert(escapedPicker.target.propertyDefinition.type === "number", "Escaped property picker lost descriptor");
	var slotPicker = api("context", { definition: { flow: { sourceVersion: 2 }, nodes: [{ block: "proof.holder", id: "holder", nodes: [
		{ block: "proof.record", id: "child", props: { out: "result.decoy" } },
		{ block: "object.keys", id: "following", props: { source: "{{ local.record }}" } }
	] }] }, node: "following", property: "source", detail: "compact" });
	assert(slotPicker.ok && JSON.stringify(slotPicker.scopes).indexOf("result.decoy") === -1, "Caller slot adopted callee dialect: " + JSON.stringify(slotPicker));
	var outputSchema = api("outputSchema", { flowSource: code });
	assert(outputSchema.ok && JSON.stringify(outputSchema).indexOf('"keys"') !== -1 && JSON.stringify(outputSchema).indexOf('"decoy"') === -1, "Flow schema contains business route: " + JSON.stringify(outputSchema));
	var nodeSchema = api("nodeOutputSchema", { flowSource: code, nodePointer: "/nodes/0", property: "$$out" });
	assert(nodeSchema.ok && nodeSchema.target.path === "local.record", "Node output schema followed business value: " + JSON.stringify(nodeSchema));
	var noNodeSchema = api("nodeOutputSchema", { flowSource: source('proof.record({ $$id: "record", id: 5, out: "result.decoy" })'), nodeId: "record" });
	assert(noNodeSchema.ok && noNodeSchema.target.path === "", "Node output schema guessed a business route: " + JSON.stringify(noNodeSchema));
	var aliasSchema = api("nodeOutputSchema", { flowSource: code, nodeId: "record", property: "out" });
	assert(aliasSchema.ok && aliasSchema.target.path === "local.record" && aliasSchema.target.property === "$$out", "Legacy output role alias differs from engine route");
	var learnedCode = 'const _flow = { sourceVersion: 2 }\nfunction OutputProof() {\nyaml.parse({ $$id: "parse", $$out: "result.document", text: "id: 5" })\n}';
	var parsedYaml = api("run", { flowSource: learnedCode, includeTrace: false });
	assert(parsedYaml.ok && parsedYaml.result.document.id === 5, "Native parser did not route result: " + JSON.stringify(parsedYaml));
	var learned = api("nodeOutputSchema", { flowSource: learnedCode, nodeId: "parse", property: "$$out", source: "learned" });
	assert(learned.ok && learned.schema.properties.id, "Learned schema was not stored under engine output role: " + JSON.stringify(learned));
	var adopted = api("nodeOutputSchema", { flowSource: code, nodeId: "record", property: "$$out", action: "adopt", source: "static" });
	assert(adopted.ok, "Output schema adoption failed: " + JSON.stringify(adopted));
	var readAdopted = api("nodeOutputSchema", { flowSource: code, nodeId: "record", property: "out", source: "learned" });
	assert(readAdopted.ok && readAdopted.schema.properties.id, "Schema role aliases use different storage keys");
	var removed = api("nodeOutputSchema", { flowSource: code, nodeId: "record", property: "$$out", action: "remove" });
	assert(removed.ok, "Output schema removal failed");
	var normalPicker = api("context", { flowSource: code, node: "keys", property: "source", detail: "normal", include: ["local", "result"] });
	var compactBytes = new java.lang.String(pickedJson).getBytes("UTF-8").length;
	var normalBytes = new java.lang.String(JSON.stringify(normalPicker)).getBytes("UTF-8").length;
	assert(compactBytes < normalBytes, "Compact context became larger than normal context");
	print("picker payload UTF-8: compact=" + compactBytes + " normal=" + normalBytes);
	var legacyCode = code.replace('const _flow = { sourceVersion: 2 }\n', '').replace(/\$\$id/g, 'id').replace(/\$\$out/g, 'out').replace(', id: 5, out: "result.decoy"', ', props: { id: 5 }');
	var legacy = api("run", { flowSource: legacyCode, includeTrace: false });
	assert(legacy.ok && legacy.result.keys.indexOf("id") !== -1, "Legacy flat source changed");
	print("source-output-contract OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
