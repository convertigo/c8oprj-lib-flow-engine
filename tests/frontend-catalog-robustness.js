// A broken, duplicated or missing provider descriptor is reported in the catalog instead of emptying it:
// the other frontend blocks, the creation palette and the backend blocks keep working, in Rhino and in Node.
var File = java.io.File, files = Packages.org.apache.commons.io.FileUtils;
var engineRoot = new File(arguments[0]).getCanonicalFile();
var provider = new File(String(java.lang.System.getenv("FLOW_FRONTBUILDER_RESOURCE_ROOT") || "")).getCanonicalFile();
if (!new File(provider, "tools/catalog-contract-proof.ts").isFile()) throw new Error("Frontend proof provider required");
var project = java.nio.file.Files.createTempDirectory("flow-catalog-robustness-").toFile();
var entry = new File(project, "_flow/frontbuilder/svelte/model/Proof/src/routes/+page.flow.svelte");
entry.getParentFile().mkdirs();
files.writeStringToFile(entry, '<script module>export const _flow = {sourceVersion: 2};</script><FlowComponent $$id="home"><Structure /></FlowComponent>\n', "UTF-8");
var __flowEngineDir = String(engineRoot), __flowProjectDir = String(project);
var engine = eval(String(files.readFileToString(new File(engineRoot, "Engine.js"), "UTF-8")));
var engineSource = "version: 1\nconfig:\n  frontbuilder:\n    svelte:\n      target: svelte5\n      resourceRoot: " + provider + "\n      modelPath: " + entry + "\n";
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function catalog(drafts, removals) {
	var result = JSON.parse(engine.catalog(JSON.stringify({ engineSource: engineSource, projectDir: String(project), includeIcons: false,
		frontendSourceDrafts: drafts, sourceRemovals: removals })));
	assert(result.ok === true, "Rhino catalog failed: " + JSON.stringify(result).substring(0, 400));
	return result;
}
function byId(list, id) { return (list || []).filter(function (descriptor) { return descriptor.id === id; })[0]; }
function nodeCatalog(drafts, removals) {
	var input = new File(project, "proof.json");
	files.writeStringToFile(input, JSON.stringify({ sourceFile: String(entry), projectRoot: String(project),
		engineProjectRoot: String(engineRoot.getParentFile()), drafts: drafts, removals: removals }), "UTF-8");
	var outputFile = new File(project, "node-proof.log");
	var process = new java.lang.ProcessBuilder(java.util.Arrays.asList([
		"node", "--import", "tsx", String(new File(provider, "tools/catalog-contract-proof.ts")), String(input)
	])).directory(provider).redirectErrorStream(true).redirectOutput(outputFile).start();
	if (!process.waitFor(45, java.util.concurrent.TimeUnit.SECONDS)) { process.destroyForcibly(); throw new Error("Node catalog proof timed out"); }
	var output = String(files.readFileToString(outputFile, "UTF-8"));
	assert(process.exitValue() === 0, "Node reader failed: " + output.substring(0, 600));
	var marker = "__FLOW_CATALOG_PROOF__", index = output.indexOf(marker);
	assert(index >= 0, "Node proof marker"); return JSON.parse(output.substring(index + marker.length));
}
try {
	var baseline = catalog({}, []);
	var authoring = new File(provider, "ui/authoring");
	var authored = files.listFiles(authoring, ["json"], false).toArray().map(function (file) { return new File(String(file)); })
		.filter(function (file) { return String(file.getName()).match(/\.uiblock\.json$/); })
		.sort(function (a, b) { return String(a.getName()) < String(b.getName()) ? -1 : 1; });
	assert(authored.length > 0, "The provider declares authoring descriptors");
	var original = JSON.parse(String(files.readFileToString(authored[0], "UTF-8")));
	var originalId = byId(baseline.frontendCreateDescriptors, "frontbuilder.svelte." + original.id) ? "frontbuilder.svelte." + original.id
		: baseline.frontendCreateDescriptors.filter(function (descriptor) { return String(descriptor.sourcePath) === String(authored[0].getCanonicalPath()); })[0].id;

	var drafts = {};
	drafts[String(new File(provider, "ui/zz-broken.uiblock.json").getCanonicalPath())] = "{ not json";
	drafts[String(new File(provider, "ui/zz-duplicate.uiblock.json").getCanonicalPath())] = JSON.stringify(original);
	var damaged = catalog(drafts, []);
	var broken = byId(damaged.frontendBlocks, "svelte.invalid.zz-broken"), duplicate = byId(damaged.frontendBlocks, "svelte.invalid.zz-duplicate");
	assert(broken && broken.kind === "error" && broken.category === "Svelte / Invalid" && broken.description.indexOf("zz-broken") !== -1,
		"An invalid descriptor is reported in the catalog: " + JSON.stringify(broken));
	assert(duplicate && duplicate.kind === "error" && duplicate.description.indexOf(String(authored[0].getCanonicalPath()) + " is used") !== -1,
		"A duplicated id is reported in the catalog: " + JSON.stringify(duplicate));
	assert(byId(damaged.frontendCreateDescriptors, originalId) && damaged.frontendCreateDescriptors.length === baseline.frontendCreateDescriptors.length,
		"The first declaration and the whole creation palette keep working");
	assert(damaged.blocks.length === baseline.blocks.length, "Backend blocks are untouched by a frontend descriptor error");
	var node = nodeCatalog(drafts, []);
	assert(node && JSON.stringify(node).indexOf(originalId.replace(/^frontbuilder\.svelte\./, "")) !== -1,
		"The Node reader keeps its catalog with the same damaged provider");

	var removals = authored.map(function (file) { return String(file.getCanonicalPath()); });
	var older = catalog({}, removals);
	var missing = byId(older.frontendBlocks, "svelte.invalid.authoring");
	assert(missing && missing.kind === "error" && missing.description.indexOf("0.1.9") !== -1,
		"A provider without authoring descriptors is reported instead of an empty creation palette: " + JSON.stringify(missing));
	assert(byId(baseline.frontendBlocks, "svelte.invalid.authoring") === undefined, "No report for a complete provider");
	print("frontend-catalog-robustness OK (" + checks + " checks)");
} finally { files.deleteDirectory(project); }
