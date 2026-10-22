// Real engine instances share only immutable Java text; plans/inputs/drafts remain local.
var files = Packages.org.apache.commons.io.FileUtils;
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir);
var root = java.nio.file.Files.createTempDirectory("shared-metadata-").toFile();
var __flowProjectDir = String(root);
var Bridge = Packages.com.twinsoft.convertigo.engine.flow.FlowEngineBridge;
var counts = {};
function assert(value, message) { if (!value) throw new Error(message); }
function write(path, text) { var file = new java.io.File(root, path); file.getParentFile().mkdirs(); files.writeStringToFile(file, text, "UTF-8"); return String(file.getCanonicalPath()); }
var source = String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var anchor = "return JSON.stringify(build());";
assert(source.indexOf(anchor) >= 0 && source.indexOf(anchor) === source.lastIndexOf(anchor), "Unique shared builder anchor");
source = source.replace(anchor, "counts[key] = (counts[key] || 0) + 1; " + anchor);
function instance() { return eval(source); }
function total(kind) { var n = 0; Object.keys(counts).forEach(function (k) { if (k.indexOf(kind + "\n") === 0) n += counts[k]; }); return n; }
function block(value) { return 'const _meta={sourceVersion:2,runtime:"rhino",properties:{value:{type:"string",kind:"value",default:"' + value + '"}},outputs:{out:{type:"string"}}}\n(function(){return {run:function(ctx,node){return ctx.props(node).value;}};}())'; }
function run(engine, options) {
	var result = JSON.parse(String(engine.run(JSON.stringify(Object.assign({ flowQName: "Proof.Example", name: "Example", flowSource: code, input: {} }, options || {})))));
	assert(result.ok, "Execution failed: " + JSON.stringify(result.error)); return result.result;
}
var code = 'function Example({input,result}){result.value=proof.echo({});result.input=input.value;}';
try {
	Bridge.clearSharedMetadata();
	var file = write("_flow/blocks/proof/echo.block.js", block("saved"));
	var a = instance(), b = instance();
	assert(run(a, { input: { value: "A" } }).value === "saved", "Saved block");
	var first = total("execution-snapshot"), descriptors = total("block-catalog"), headers = total("block-header");
	var second = run(b, { input: { value: "B" } });
	assert(second.input === "B" && second.value === "saved", "Inputs cannot travel with a shared plan");
	assert(first === 1 && total("execution-snapshot") === first, "Second runtime rebuilt the plan");
	assert(descriptors > 0 && total("block-catalog") === descriptors, "Second runtime rebuilt descriptors");
	assert(headers > 0 && total("block-header") === headers, "Second runtime reparsed immutable block headers");
	var drafts = {}; drafts[file] = block("draft");
	assert(run(a, { sourceDrafts: drafts }).value === "draft", "Hot plan ignored a draft");
	assert(total("execution-snapshot") === first, "Draft plan entered shared registry");
	assert(run(b).value === "saved" && run(a).value === "saved", "Draft leaked into saved callers");
	write("_flow/blocks/proof/echo.block.js", block("changed-on-disk"));
	assert(run(instance()).value === "changed-on-disk", "New dependency revision reused an old plan");
	assert(total("execution-snapshot") === first + 1, "Changed dependency must rebuild exactly once");
	var disk = new java.io.File(file), modified = disk.lastModified();
	write("_flow/blocks/proof/echo.block.js", block("changed-ON-disk"));
	disk.setLastModified(modified);
	Bridge.invalidateProjectDataCaches(String(root));
	assert(run(instance()).value === "changed-ON-disk", "Explicit edit with unchanged file attributes reused a snapshot");
	assert(total("execution-snapshot") === first + 2, "Project revision must invalidate the snapshot");
	Bridge.invalidateProjectDataCaches(String(new java.io.File(root, "unrelated")));
	assert(run(instance()).value === "changed-ON-disk", "Unrelated invalidation changed this project");
	assert(total("execution-snapshot") === first + 2, "Unrelated project invalidated shared metadata");
	Bridge.clearSharedMetadata();
	assert(run(instance()).value === "changed-ON-disk", "Explicit clear changed behavior");
	assert(total("execution-snapshot") === first + 3, "Explicit clear did not rebuild");
	print("shared metadata Rhino tests passed");
} finally { Bridge.clearSharedMetadata(); files.deleteDirectory(root); }
