// The Java bridge refreshes a pooled runtime with cacheClear("{}") once the data of a project changed, after any source
// write of any project: in the Studio, each call after a write started cold, the check of a page taking about 4 s
// instead of 1 s. The refresh keeps the caches keyed by the content and revisions of what they read (block catalogs,
// types, engine modules, provider documents) and still sees a changed source; an explicit clear drops them all.
// Run: java -cp <rhino:commons-io> org.mozilla.javascript.tools.shell.Main tests/pooled-refresh-keeps-content-caches.js <engine _flow dir>
// with FLOW_FRONTBUILDER_RESOURCE_ROOT set to the resource root of the Svelte frontbuilder.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function write(file, text) { files.writeStringToFile(file, String(text), "UTF-8"); }
var providerResourceRoot = String(java.lang.System.getenv("FLOW_FRONTBUILDER_RESOURCE_ROOT") || "");
if (!providerResourceRoot) throw new Error("FLOW_FRONTBUILDER_RESOURCE_ROOT required");
var temp = java.nio.file.Files.createTempDirectory("flow-pooled-refresh-").toFile().getCanonicalFile();
var project = new java.io.File(temp, "App");
try {
	var providerProject = new java.io.File(providerResourceRoot).getCanonicalFile().getParentFile().getParentFile().getParentFile();
	java.nio.file.Files.createSymbolicLink(new java.io.File(temp, "lib_flow_frontbuilder_svelte").toPath(), providerProject.toPath());
	write(new java.io.File(project, "c8oProject.yaml"), "↑App [core.Project]:\n  ↓frontbuilder [references.ProjectSchemaReference]:\n" +
		"    projectName: lib_flow_frontbuilder_svelte\n");
	var modelPath = "_flow/frontbuilder/svelte/model/App/src/routes/+page.flow.svelte";
	var engineSource = "version: 1\nconfig:\n  frontbuilder:\n    svelte:\n      target: svelte5\n      resourceRoot: " +
		providerResourceRoot + "\n      modelPath: " + modelPath + "\n";
	write(new java.io.File(project, "_flow/engine.yaml"), engineSource);
	write(new java.io.File(project, modelPath), "<script module>\n  export const _flow = { sourceVersion: 2 };\n</script>\n\n" +
		"<FlowComponent\n  $$id=\"page\"\n  label=\"Items\"\n>\n  <Variables />\n  <Structure />\n</FlowComponent>\n");
	var blockFile = new java.io.File(project, "_flow/blocks/proof/echo.block.js");
	var blockSource = 'const _meta = { runtime: "rhino", description: "Echoes a value.", properties: { value: { kind: "value", type: "string" } }, outputs: { out: { type: "string" } } }\n' +
		'(function () { return { run: function (ctx, node) { return ctx.template(ctx.props(node).value); } }; }())';
	write(blockFile, blockSource);

	var __flowEngineDir = String(engineDir.getAbsolutePath());
	var __flowProjectDir = String(project.getAbsolutePath());
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function misses() {
		var info = JSON.parse(engine.cacheInfo());
		var caches = info.caches || info.result && info.result.caches || {};
		var out = {};
		["blocks", "coreBlocks", "types", "engineModules", "frontendDocuments", "treeSnapshots"].forEach(function (name) {
			out[name] = Number(caches[name] && caches[name].misses || 0);
		});
		return out;
	}
	function tree() {
		var out = JSON.parse(engine.authoringTree(JSON.stringify({ projectDir: __flowProjectDir, engineSource: engineSource,
			surface: "frontend", builder: "svelte", detail: "compact", maxDepth: 20, includeDefinition: false,
			includeBindings: false, includeFlowCatalog: false, includeFrontendCatalog: false })));
		var value = out.result || out;
		assert(value.ok !== false && Array.isArray(value.children) && value.children.length > 0,
			"the frontend tree failed: " + JSON.stringify(out).substring(0, 800));
	}
	function description() {
		var out = JSON.parse(engine.blockGet(JSON.stringify({ name: "proof.echo" })));
		return JSON.stringify(out);
	}
	tree();
	description();
	var warm = misses();
	assert(warm.blocks > 0 && warm.frontendDocuments > 0, "the caches were not used: " + JSON.stringify(warm));

	// 1. A pooled runtime refreshed after a write elsewhere answers from the caches of the content it read.
	engine.cacheClear("{}");
	tree();
	description();
	var refreshed = misses();
	["blocks", "coreBlocks", "types", "engineModules", "frontendDocuments"].forEach(function (name) {
		assert(refreshed[name] === warm[name], "the refresh dropped the " + name + " cache: " + JSON.stringify(warm) + " -> " +
			JSON.stringify(refreshed));
	});
	assert(refreshed.treeSnapshots > warm.treeSnapshots, "the refresh kept the tree snapshots, computed again from the kept caches");

	// 2. A source changed on disk is still seen after a refresh: the keys hold the fingerprints of what they read.
	write(blockFile, blockSource.replace("Echoes a value.", "Echoes a value, changed on disk."));
	blockFile.setLastModified(blockFile.lastModified() + 2000);
	engine.cacheClear("{}");
	assert(description().indexOf("changed on disk") !== -1, "the block catalog kept by a refresh missed a changed block");
	assert(misses().blocks > refreshed.blocks, "a changed block did not change the key of the block catalog");

	// 3. An explicit clear (flow-cache-clear, the Studio) drops them all.
	var beforeClear = misses();
	engine.cacheClear();
	tree();
	description();
	var cleared = misses();
	["blocks", "coreBlocks", "engineModules", "frontendDocuments"].forEach(function (name) {
		assert(cleared[name] > beforeClear[name], "an explicit clear kept the " + name + " cache: " + JSON.stringify(beforeClear) +
			" -> " + JSON.stringify(cleared));
	});
	print("pooled-refresh-keeps-content-caches OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(temp);
}
