// What is computed from the content of sources (block headers, compiled block descriptors, Flow models) is computed
// once for every runtime of a server (FlowEngineBridge.sharedSourceMemo), else once per runtime; working copies and
// failures never enter it, and a hit answers what a build answers.
var files = Packages.org.apache.commons.io.FileUtils;
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir);
var root = java.nio.file.Files.createTempDirectory("source-memo-").toFile().getCanonicalFile();
var __flowProjectDir = String(root);
var Bridge = Packages.com.twinsoft.convertigo.engine.flow.FlowEngineBridge;
var shared = false;
try { shared = typeof Bridge.sharedSourceMemo === "function"; } catch (noEngine) { shared = false; }
function assert(value, message) { if (!value) throw new Error(message); }
function write(path, text) {
	var file = new java.io.File(root, path); file.getParentFile().mkdirs(); files.writeStringToFile(file, text, "UTF-8");
	return String(file.getCanonicalPath());
}
var source = String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
function instance() { return eval(source); }
function call(engine, method, request) {
	var answer = JSON.parse(String(engine[method](JSON.stringify(Object.assign({ projectDir: String(root) }, request || {})))));
	assert(answer.ok !== false, method + " failed: " + JSON.stringify(answer.error));
	return answer;
}
function stats(engine, kind) {
	var kinds = JSON.parse(String(engine.cacheInfo())).caches.sourceMemo.kinds || {};
	return kinds[kind] || { calls: 0, builds: 0, bypasses: 0 };
}
function builds(engines, kind) {
	return engines.reduce(function (sum, engine) { return sum + stats(engine, kind).builds; }, 0);
}
function echo(kind) {
	return 'const _meta={sourceVersion:2,runtime:"rhino",properties:{value:{type:"string",kind:"' + kind + '",default:"x"}},outputs:{out:{type:"string"}}}\n'
		+ '(function(){return {run:function(ctx,node){return String(ctx.input({ value: ctx.props(node).value }));}};}())';
}
function wrap(suffix) {
	return 'const _meta={sourceVersion:2,description:"Wraps.",properties:{text:{type:"string",kind:"template"}},outputs:{out:{type:"string"}}}\n'
		+ 'function proof_wrap({ input, result }) {\n  local.echoed = proof.echo({ value: input.text + "' + suffix + '" })\n  return local.echoed\n}\n';
}
var flow = 'function Example({ input, result }) {\n  result.value = proof.wrap({ text: input.name })\n  return result\n}\n';
var engineTree = { target: "engine", engineSource: "", includeFlowCatalog: true, flowCatalogOrigin: "project", includeCatalogLibraries: false, includeBindings: false };
var flowTree = { target: "flow", flowQName: "Proof.Example", flowName: "Example", flowSource: flow };
function run(engine, options) {
	var answer = call(engine, "run", Object.assign({ flowQName: "Proof.Example", flowName: "Example", flowSource: flow, input: { name: "ada" } }, options || {}));
	return answer.result.value;
}
function tree(engine, request) {
	var answer = call(engine, "describeTree", request);
	delete answer.profile;
	return JSON.stringify(answer);
}
try {
	if (shared) Bridge.clearCaches();
	write("_flow/blocks/proof/echo.block.js", echo("template"));
	var wrapFile = write("_flow/blocks/proof/wrap.block.js", wrap(""));
	write("_flow/flows/Example.flow.js", flow);
	var a = instance(), b = instance();
	var engineA = tree(a, engineTree), flowA = tree(a, flowTree);
	var ran = run(a);
	assert(ran === "ada", "The saved blocks do not run: " + JSON.stringify(ran));
	var described = builds([a], "block-descriptor"), headers = builds([a], "block-meta"), models = builds([a], "flow-source");
	assert(described >= 1 && headers >= 2 && models >= 1, "Nothing was kept: " + JSON.stringify(JSON.parse(String(a.cacheInfo())).caches.sourceMemo));
	assert(stats(a, "block-meta").calls > headers, "A block header was read once only: no repetition to spare");
	// a hit answers what a build answered
	assert(tree(a, engineTree) === engineA && tree(a, flowTree) === flowA, "A hit changed a tree");
	assert(builds([a], "block-descriptor") === described && builds([a], "flow-source") === models, "A runtime parsed its sources again");
	assert(tree(b, engineTree) === engineA && tree(b, flowTree) === flowA && run(b) === "ada", "Another runtime answered otherwise");
	if (shared) {
		assert(builds([b], "block-descriptor") === 0 && builds([b], "block-meta") === 0 && builds([b], "flow-source") === 0,
			"Another runtime parsed the sources again: " + JSON.stringify(JSON.parse(String(b.cacheInfo())).caches.sourceMemo));
	} else {
		assert(builds([b], "block-descriptor") === described, "Without the engine, each runtime keeps its own");
	}
	// working copies are the caller's: never kept, never read from the memo
	var drafts = {}; drafts[wrapFile] = wrap("!");
	var before = builds([a, b], "block-descriptor");
	assert(run(a, { sourceDrafts: drafts }) === "ada!", "A draft of a block was ignored");
	assert(stats(a, "block-descriptor").bypasses >= 1 && builds([a, b], "block-descriptor") === before, "A draft entered the memo");
	assert(run(b) === "ada" && run(instance()) === "ada", "A draft leaked to the saved callers");
	// the content of a source is its key
	write("_flow/blocks/proof/wrap.block.js", wrap("?"));
	var c = instance();
	assert(run(c) === "ada?", "A changed block kept its old descriptor");
	assert(builds([c], "block-descriptor") >= 1, "A changed block was not compiled again");
	// so is the revision of the catalog it is compiled against: a contract changed with the same file attributes
	var echoFile = new java.io.File(root, "_flow/blocks/proof/echo.block.js"), modified = echoFile.lastModified();
	write("_flow/blocks/proof/echo.block.js", echo("value"));
	echoFile.setLastModified(modified);
	if (shared) {
		Bridge.invalidateProjectDataCaches(String(root));
		var d = instance();
		tree(d, engineTree);
		assert(builds([d], "block-descriptor") >= 1, "A new revision of the catalog reused a descriptor compiled against the old one");
		// the invalidation of the data caches keeps what its keys name
		Bridge.invalidateDataCaches();
		var e = instance();
		tree(e, engineTree);
		assert(builds([e], "block-descriptor") === 0 && builds([e], "block-meta") === 0, "A data invalidation dropped the memo");
		Bridge.clearSharedMetadata();
		var f = instance();
		tree(f, engineTree);
		assert(builds([f], "block-descriptor") >= 1 && builds([f], "block-meta") >= 1, "An explicit clear kept the memo");
	}
	// a failure is never kept: each caller fails alike
	write("_flow/blocks/proof/broken.block.js", 'const _meta={sourceVersion:2,outputs:{out:{type:"string"}}}\nfunction proof_broken({ input }) {\n  local.x = (\n}\n');
	write("_flow/flows/Broken.flow.js", 'function Broken({ result }) {\n  result.value = proof.broken({})\n  return result\n}\n');
	var g = instance(), failures = [];
	for (var i = 0; i < 2; i++) {
		var answer = JSON.parse(String(g.run(JSON.stringify({ projectDir: String(root), flowQName: "Proof.Broken", flowName: "Broken",
			flowSource: String(files.readFileToString(new java.io.File(root, "_flow/flows/Broken.flow.js"), "UTF-8")), input: {} }))));
		assert(answer.ok === false, "A broken block ran");
		failures.push(String(answer.error && answer.error.code));
	}
	assert(failures[0] === failures[1], "A kept failure answered otherwise: " + failures.join(", "));
	print("source memo Rhino tests passed (" + (shared ? "shared by the engine" : "per runtime") + ")");
} finally {
	if (shared) Bridge.clearCaches();
	files.deleteDirectory(root);
}
