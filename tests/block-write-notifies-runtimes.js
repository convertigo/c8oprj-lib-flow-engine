// A project block written by the engine (block code-set, code-patch, create, edit, duplicate) is a source Convertigo did
// not write: the engine tells it (FlowEngineBridge.notifySourceMutation), as the Studio and the MCP do for the sources
// they write, so that every other runtime of the server drops what it compiled with the previous block. Before, only
// the runtime that wrote the block cleared its caches: a runtime that had run a Flow of the project kept its run plan,
// and the next runs of that Flow (requestable-execute, HTTP) ran the previous block until the probe of the files, at
// most once a minute, or until a cache clear.
//
// Two engines stand for two runtimes of one server: the writer (the MCP) and the runner (the Flows of the project). The
// writer sees a recording stand-in of FlowEngineBridge; on each notification, the test does what Convertigo does for the
// other runtimes (a new data generation, their caches cleared at their next call).
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-block-write-notifies-").toFile().getCanonicalFile();
var __flowProjectDir = String(project.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
try {
	var engineSource = String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
	var notifications = [];
	// Packages, the FlowEngineBridge of the writer recording the notifications, all else unchanged
	function overlay(real, path, leaf) {
		return new Proxy({}, {
			get: function (target, key) {
				if (String(key) !== path[0]) return real[key];
				return path.length === 1 ? leaf(real[key]) : overlay(real[key], path.slice(1), leaf);
			}
		});
	}
	var writerPackages = overlay(Packages, ["com", "twinsoft", "convertigo", "engine", "flow", "FlowEngineBridge"], function (bridge) {
		return new Proxy({}, {
			get: function (target, key) {
				if (String(key) === "notifySourceMutationWithReveal") {
					return function (projectDir, sourcePath, reveal) {
						notifications.push({ projectDir: String(projectDir), sourcePath: String(sourcePath), reveal: reveal === true });
					};
				}
				return bridge[key];
			}
		});
	});
	var writer = (function (Packages) { return eval(engineSource); })(writerPackages);
	var runner = eval(engineSource);
	function api(engine, name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }

	function block(word) {
		return 'const _meta = {runtime:"rhino", description:"Labels.", properties:{text:{kind:"value",type:"string",description:"Text."}}}\n' +
			'(function(){return {run:function(ctx,node){return "' + word + ' " + ctx.props(node).text;}};}())';
	}
	var created = api(writer, "blockCodeSet", { projectDir: __flowProjectDir, name: "proof.label", code: block("v1") });
	assert(created.ok, "blockCodeSet: " + JSON.stringify(created));
	var flowSource = 'const _flow = {sourceVersion:2}\nfunction Labelled({ result }) {\n  proof.label({ $$out: "result.value", text: "item" })\n}\n';
	var flowFile = new java.io.File(project, "_flow/flows/Labelled.flow.js");
	files.writeStringToFile(flowFile, flowSource, "UTF-8");
	// a promoted Flow run by Convertigo: its saved source, its name and its project
	function run() {
		var out = api(runner, "run", { flowSource: flowSource, flowName: "Labelled", flowQName: "Proof.Labelled", projectDir: __flowProjectDir, includeTrace: false });
		assert(out.ok !== false, "run: " + JSON.stringify(out).substring(0, 800));
		return String(out.result && out.result.value);
	}
	// what Convertigo does for the other runtimes when told: they clear their caches at their next call
	function deliver() {
		var told = notifications.splice(0);
		if (told.length) runner.cacheClear("{}");
		return told;
	}
	deliver();
	assert(run() === "v1 item", "the first run uses the first block");
	assert(run() === "v1 item", "a second run reuses the plan");

	function written(label, told, file) {
		assert(told.length > 0, label + " did not tell Convertigo that a source of the project changed");
		assert(told.every(function (each) { return each.projectDir === __flowProjectDir && each.reveal === false; }),
			label + " told another project or asked to reveal: " + JSON.stringify(told));
		assert(told.some(function (each) { return String(new java.io.File(each.sourcePath).getCanonicalPath()) === String(file.getCanonicalPath()); }),
			label + " did not name the block file " + file + ": " + JSON.stringify(told));
	}
	var blockFile = new java.io.File(String(created.codeFile));

	// code-set of the block: the runner runs the new block at once
	var set = api(writer, "blockCodeSet", { projectDir: __flowProjectDir, name: "proof.label", code: block("v2"), overwrite: true });
	assert(set.ok, "blockCodeSet v2: " + JSON.stringify(set));
	written("block code-set", deliver(), blockFile);
	assert(run() === "v2 item", "after a block code-set, the Flow still ran the previous block");

	// code-patch of the block
	var current = api(writer, "blockCodeGet", { projectDir: __flowProjectDir, name: "proof.label" });
	var patched = api(writer, "blockCodePatch", { projectDir: __flowProjectDir, name: "proof.label", revision: current.revision, code: block("v3") });
	assert(patched.ok, "blockCodePatch: " + JSON.stringify(patched));
	written("block code-patch", deliver(), blockFile);
	assert(run() === "v3 item", "after a block code-patch, the Flow still ran the previous block");

	// a refused write changes nothing and tells nothing
	var refused = api(writer, "blockCodeSet", { projectDir: __flowProjectDir, name: "proof.label", overwrite: true,
		code: 'const _meta = {description:"Labels."}\nfunction label({ input, result }) {\n  missing.block({ text: "x" })\n}' });
	assert(!refused.ok, "an invalid block was accepted: " + JSON.stringify(refused));
	assert(deliver().length === 0, "a refused block write told Convertigo of a change");

	// the other writers of project blocks: create, duplicate, edit
	var made = api(writer, "blockCreate", { projectDir: __flowProjectDir, name: "proof.other", code: block("other") });
	assert(made.ok !== false, "blockCreate: " + JSON.stringify(made));
	written("block create", deliver(), new java.io.File(project, "_flow/blocks/proof/other.block.js"));
	var copied = api(writer, "blockDuplicate", { projectDir: __flowProjectDir, fromName: "proof.other", toName: "proof.copy" });
	assert(copied.ok !== false, "blockDuplicate: " + JSON.stringify(copied));
	written("block duplicate", deliver(), new java.io.File(project, "_flow/blocks/proof/copy.block.js"));
	var edited = api(writer, "blockEdit", { projectDir: __flowProjectDir, name: "proof.copy", description: "Copied." });
	assert(edited.ok !== false, "blockEdit: " + JSON.stringify(edited));
	written("block edit", deliver(), new java.io.File(project, "_flow/blocks/proof/copy.block.js"));

	print("block-write-notifies-runtimes OK (" + checks + " checks)");
} finally {
	files.deleteQuietly(project);
}
