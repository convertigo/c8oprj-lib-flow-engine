// Source discovery, metadata and runtime must agree with one working-copy view.
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var __flowEngineDir = String(engineDir);
var root = java.nio.file.Files.createTempDirectory("flow-source-runtime-").toFile();
var __flowProjectDir = String(root);
var files = Packages.org.apache.commons.io.FileUtils;
function write(path, text) {
	var file = new java.io.File(root, path); file.getParentFile().mkdirs();
	files.writeStringToFile(file, text, "UTF-8"); return String(file.getCanonicalPath());
}
function assert(value, message) { if (!value) throw new Error(message); }
try {
	var source = 'const _meta={sourceVersion:2,runtime:"rhino",targets:["backend"],properties:{},outputs:{out:{type:"number"}}}\n'
		+ '(function(){return {run:function(){return 7;}};}())';
	var old = write("_flow/blocks/proof/old.block.js", source);
	var configuration = write("_flow/engine.yaml", '{"version":1,"config":{"message":"saved"}}');
	var oldFlow = write("_flow/flows/Original.flow.js", 'const _flow={sourceVersion:2}\nfunction Original(){result.answer = proof.old({});}\n');
	var oldType = write("_flow/types/oldType.type.yaml", 'version: 1\nname: oldType\ntype: string\n');
	var moved = String(new java.io.File(root, "_flow/blocks/proof/moved.block.js").getCanonicalPath());
	var movedFlow = String(new java.io.File(root, "_flow/flows/Moved.flow.js").getCanonicalPath());
	var movedType = String(new java.io.File(root, "_flow/types/movedType.type.yaml").getCanonicalPath());
	var drafts = {};
	drafts[moved] = source;
	drafts[movedFlow] = 'const _flow={sourceVersion:2}\nfunction Moved(){result.answer = proof.moved({});}\n';
	drafts[movedType] = 'version: 1\nname: movedType\ntype: string\nlabel: Draft label\n';
	drafts[configuration] = '{"version":1,"config":{"message":"draft"}}';
	var removals = [old, oldFlow, oldType];
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function call(method, options, saved) {
		return JSON.parse(engine[method](JSON.stringify(Object.assign({ frontendSourceDrafts: saved ? {} : drafts,
			sourceRemovals: saved ? [] : removals, includeIcons: false }, options || {}))));
	}
	function flatten(node) { return [node].concat((node.children || []).reduce(function (all, child) { return all.concat(flatten(child)); }, [])); }
	var catalog = call("catalog", { detail: "full" });
	assert(catalog.ok && JSON.stringify(catalog).indexOf('proof.moved') >= 0, "New draft block joins the catalog: " + JSON.stringify(catalog));
	assert(JSON.stringify(catalog).indexOf('proof.old') < 0, "Removed block cannot leak through a cache");
	var descriptor = call("typeGet", { name: "movedType" });
	assert(descriptor.ok !== false && descriptor.descriptorSource && descriptor.descriptorSource.indexOf("Draft label") >= 0,
		"Types read their draft source: " + JSON.stringify(descriptor));
	assert(!call("typeGet", { name: "oldType" }).ok, "Removed type is absent");
	var tree = call("describeTree", { target: "flow", name: "Moved" });
	assert(tree.ok !== false && flatten(tree).some(function (node) { return node.type === "proof.moved"; }),
		"New flow is readable by its canonical name: " + JSON.stringify(tree));
	assert(!call("describeTree", { target: "flow", name: "Original" }).ok, "Removed flow is absent");
	var run = call("run", { flowSource: drafts[movedFlow], includeTrace: false });
	assert(run.ok && run.result.answer === 7, "Runtime executes the new block: " + JSON.stringify(run));
	var configRun = call("run", { flowSource: 'function Proof(){result.message = config.message;}', includeTrace: false });
	assert(configRun.ok && configRun.result.message === "draft", "Project configuration uses the same draft view");
	var restored = call("catalog", { detail: "full" }, true);
	assert(restored.ok && JSON.stringify(restored).indexOf('proof.old') >= 0 && JSON.stringify(restored).indexOf('proof.moved') < 0,
		"Discard restores the catalog without publication");
	assert(new java.io.File(old).isFile() && !new java.io.File(moved).exists(), "Runtime did not publish the move");
	print("source-overlay-runtime OK");
} finally { files.deleteDirectory(root); }
