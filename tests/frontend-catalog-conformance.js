// The real Rhino and Node readers must expose the same provider vocabulary,
// including trait composition, and use the same draft/discard source view.
var File = java.io.File, files = Packages.org.apache.commons.io.FileUtils;
var engineRoot = new File(arguments[0]).getCanonicalFile();
var provider = new File(String(java.lang.System.getenv("FLOW_FRONTBUILDER_RESOURCE_ROOT") || "")).getCanonicalFile();
if (!new File(provider, "tools/catalog-contract-proof.ts").isFile()) throw new Error("Frontend proof provider required");
var project = java.nio.file.Files.createTempDirectory("flow-catalog-conformance-").toFile();
var entry = new File(project, "_flow/frontbuilder/svelte/model/Proof/src/routes/+page.flow.svelte");
entry.getParentFile().mkdirs();
files.writeStringToFile(entry, '<script module>export const _flow = {sourceVersion: 2};</script><FlowComponent $$id="home"><Structure /></FlowComponent>\n', "UTF-8");
var __flowEngineDir = String(engineRoot), __flowProjectDir = String(project);
var engine = eval(String(files.readFileToString(new File(engineRoot, "Engine.js"), "UTF-8")));
var engineSource = "version: 1\nconfig:\n  frontbuilder:\n    svelte:\n      target: svelte5\n      resourceRoot: " + provider + "\n      modelPath: " + entry + "\n";
var drafts = {}, removals = [];
function assert(value, message) { if (!value) throw new Error(message); }
function canonical(value) {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === "object") {
		var result = {}; Object.keys(value).sort().forEach(function (key) { result[key] = canonical(value[key]); }); return result;
	}
	return value;
}
function nodeCatalog() {
	var input = new File(project, "proof.json");
	files.writeStringToFile(input, JSON.stringify({ sourceFile: String(entry), projectRoot: String(project),
		engineProjectRoot: String(engineRoot.getParentFile()), drafts: drafts, removals: removals }), "UTF-8");
	var outputFile = new File(project, "node-proof.log");
	var process = new java.lang.ProcessBuilder(java.util.Arrays.asList([
		"node", "--import", "tsx", String(new File(provider, "tools/catalog-contract-proof.ts")), String(input)
	])).directory(provider).redirectErrorStream(true).redirectOutput(outputFile).start();
	if (!process.waitFor(45, java.util.concurrent.TimeUnit.SECONDS)) {
		process.destroyForcibly(); throw new Error("Node catalog proof timed out");
	}
	var output = String(files.readFileToString(outputFile, "UTF-8"));
	assert(process.exitValue() === 0, "Node reader failed: " + output);
	var marker = "__FLOW_CATALOG_PROOF__", index = output.indexOf(marker);
	assert(index >= 0, "Node proof marker"); return JSON.parse(output.substring(index + marker.length));
}
function compare() {
	var result = JSON.parse(engine.catalog(JSON.stringify({ engineSource: engineSource,
		projectDir: String(project), includeIcons: false, frontendSourceDrafts: drafts, sourceRemovals: removals })));
	assert(result.ok === true, "Rhino reader failed: " + JSON.stringify(result));
	var root = String(new File(provider, "ui/authoring")) + "/";
	var rhino = (result.frontendCreateDescriptors || []).filter(function (descriptor) { return String(descriptor.sourcePath).indexOf(root) === 0; });
	var node = nodeCatalog();
	assert(node.length > 50 && rhino.length === node.length, "Same complete catalog: " + rhino.length + " / " + node.length);
	var fields = ["id", "label", "description", "longDescription", "category", "icon", "kind", "tag", "aliases",
		"targetKinds", "acceptedPositions", "traits", "slots", "properties", "insert", "defaults", "engineProperties", "effects", "implementation", "resultSchema"];
	var byId = {}; rhino.forEach(function (descriptor) { byId[descriptor.id] = descriptor; });
	node.forEach(function (descriptor) {
		assert(byId[descriptor.id], "Rhino also knows " + descriptor.id);
		fields.forEach(function (key) {
			var left = byId[descriptor.id][key], right = descriptor[key];
			assert(JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)), descriptor.id + "." + key + ": " + JSON.stringify(left) + " != " + JSON.stringify(right));
		});
	});
	return byId;
}
try {
	var saved = compare();
	assert(saved["frontbuilder.svelte.interval"].properties.reentrancy.default === "drop", "Interval gets the shared trigger policy");
	var file = new File(provider, "ui/authoring/svelte.interval.uiblock.json");
	var raw = JSON.parse(String(files.readFileToString(file, "UTF-8")));
	raw.label = "Draft timer"; raw.properties.milliseconds.default = 42;
	raw.traits["ui.trigger"].reentrancy.default = "latest";
	drafts[String(file)] = JSON.stringify(raw);
	removals = [String(new File(provider, "ui/authoring/svelte.timeout.uiblock.json"))];
	var changed = compare();
	assert(changed[raw.id].label === "Draft timer" && changed[raw.id].properties.milliseconds.default === 42
		&& changed[raw.id].properties.reentrancy.default === "latest", "Source edits change both contracts");
	assert(!changed["frontbuilder.svelte.timeout"], "No hidden built-in resurrects a removed descriptor");
	raw.tag = ""; raw.traits = [];
	drafts[String(file)] = JSON.stringify(raw);
	var empty = compare();
	assert(empty[raw.id].tag === "" && empty[raw.id].traits.length === 0
		&& !empty[raw.id].properties.reentrancy, "Explicit empty contracts do not invent a tag or traits");
	drafts[String(new File(provider, "ui/authoring/duplicate-proof.uiblock.json"))] = JSON.stringify(raw);
	var duplicate = JSON.parse(engine.catalog(JSON.stringify({ engineSource: engineSource,
		projectDir: String(project), includeIcons: false, frontendSourceDrafts: drafts, sourceRemovals: removals })));
	// A duplicate is reported by both readers; the first declaration keeps working instead of the whole catalog failing.
	var reported = (duplicate.frontendBlocks || []).filter(function (descriptor) { return descriptor.kind === "error"; })[0];
	assert(duplicate.ok === true && reported && reported.kind === "error" && reported.description.indexOf("Duplicate Flow Svelte component id") >= 0,
		"Rhino reports duplicate vocabulary and keeps its catalog");
	assert((duplicate.frontendCreateDescriptors || []).filter(function (descriptor) { return descriptor.id === raw.id; }).length === 1,
		"The first declaration stays the single creation contract");
	var nodeDuplicate = nodeCatalog().filter(function (descriptor) { return descriptor.kind === "error"; })[0];
	assert(nodeDuplicate && nodeDuplicate.description.indexOf("Duplicate Flow Svelte component id") >= 0, "Node reports the same duplicate vocabulary");
	drafts = {}; removals = [];
	var discarded = compare();
	assert(discarded[raw.id].label === saved[raw.id].label && discarded["frontbuilder.svelte.timeout"], "Discard restores both saved contracts");
} finally { files.deleteDirectory(project); }
print("frontend-catalog-conformance OK (single source -> Rhino/Node traits -> drafts -> discard)");
