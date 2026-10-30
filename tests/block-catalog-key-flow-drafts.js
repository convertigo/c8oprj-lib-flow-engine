// The block catalog reads no executable Flow: the working copies of the Flows (a server request carries them in
// frontendSourceDrafts until the Flow is saved) stay out of its key, so a Flow edit reuses the catalog, the core one
// included. A working copy of a block still changes the key, and the catalog sees it.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-catalog-flow-drafts-").toFile().getCanonicalFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function write(file, text) { files.writeStringToFile(file, String(text), "UTF-8"); }
try {
	var blockFile = new java.io.File(project, "_flow/blocks/proof/echo.block.js");
	var blockSource = 'const _meta = { runtime: "rhino", description: "Echoes a value.", properties: { value: { kind: "value", type: "string" } }, outputs: { out: { type: "string" } } }\n' +
		'(function () { return { run: function (ctx, node) { return ctx.template(ctx.props(node).value); } }; }())';
	write(blockFile, blockSource);
	var flowFile = new java.io.File(project, "_flow/flows/Echo.flow.js");
	function code(word) {
		return 'const _flow = { sourceVersion: 2 }\nfunction Echo({ result }) {\n  result.value = proof.echo({ value: "' + word + '" })\n}\n';
	}
	write(flowFile, code("saved"));
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function drafts(entries) {
		var map = {};
		Object.keys(entries).forEach(function (path) { map[path] = entries[path]; });
		return map;
	}
	function misses() {
		var info = JSON.parse(engine.cacheInfo());
		var caches = info.caches || info.result && info.result.caches || {};
		return { blocks: Number(caches.blocks && caches.blocks.misses || 0), core: Number(caches.coreBlocks && caches.coreBlocks.misses || 0) };
	}
	function check(writes, removals) {
		var out = JSON.parse(engine.flowCodeCheck(JSON.stringify({ name: "Echo", code: code("checked"), frontendSourceDrafts: writes, sourceRemovals: removals || [] })));
		assert(out.ok === true, "the check failed: " + JSON.stringify(out).substring(0, 800));
		return out;
	}
	var flowPath = String(flowFile.getCanonicalPath());
	var otherFlowPath = String(new java.io.File(project, "_flow/flows/Other.flow.js").getCanonicalPath());
	check({});
	var saved = misses();
	for (var edit = 0; edit < 4; edit++) {
		var entries = {};
		entries[flowPath] = code("edit " + edit);
		entries[otherFlowPath] = 'function Other({ result }) {\n  result.value = ' + edit + '\n}\n';
		check(drafts(entries));
	}
	check({}, [otherFlowPath]);
	var afterFlows = misses();
	assert(afterFlows.blocks === saved.blocks && afterFlows.core === saved.core,
		"Flow working copies loaded the block catalog again: " + JSON.stringify(saved) + " -> " + JSON.stringify(afterFlows));

	var withBlock = {};
	withBlock[flowPath] = code("edit");
	withBlock[String(blockFile.getCanonicalPath())] = blockSource.replace("Echoes a value.", "Echoes a value, from its working copy.");
	check(withBlock);
	assert(misses().blocks > afterFlows.blocks, "a block working copy did not change the key of the catalog");
	var described = JSON.parse(engine.blockGet(JSON.stringify({ name: "proof.echo", frontendSourceDrafts: withBlock })));
	assert(JSON.stringify(described).indexOf("from its working copy") !== -1, "the catalog does not see the block working copy: " + JSON.stringify(described).substring(0, 600));
	var plain = JSON.parse(engine.blockGet(JSON.stringify({ name: "proof.echo", frontendSourceDrafts: drafts((function () { var e = {}; e[flowPath] = code("x"); return e; })()) })));
	assert(JSON.stringify(plain).indexOf("from its working copy") === -1 && JSON.stringify(plain).indexOf("Echoes a value.") !== -1,
		"a Flow working copy alone saw the block working copy of another request");
	print("block-catalog-key-flow-drafts OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(project);
}
