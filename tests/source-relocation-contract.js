// Real descriptor -> generic resource intention -> draft plan -> Rhino/Node AST.
var File = java.io.File, files = Packages.org.apache.commons.io.FileUtils;
var engineDir = new File(arguments[0]).getCanonicalFile();
var __flowEngineDir = String(engineDir);
var sandbox = java.nio.file.Files.createTempDirectory("flow-source-rename-contract-");
var original = java.nio.file.Files.createDirectory(sandbox.resolve("project"));
var root = java.nio.file.Files.createSymbolicLink(sandbox.resolve("linked-project"), original).toFile();
var __flowProjectDir = String(root);
var provider = String(java.lang.System.getenv("FLOW_FRONTBUILDER_RESOURCE_ROOT") || "");
if (!provider) throw new Error("FLOW_FRONTBUILDER_RESOURCE_ROOT required");
var routes = new File(root, "_flow/frontbuilder/svelte/model/Proof/src/routes");
function source(id) { return '<script module>export const _flow = { sourceVersion: 2 };</script>\n<FlowComponent $$id="' + id + '"><Structure /></FlowComponent>\n'; }
var entry = new File(routes, "+page.flow.svelte");
var saved = new File(routes, "old/[id]/+page.flow.svelte");
var initial = source("detail");
[entry, saved].forEach(function (file) { file.getParentFile().mkdirs(); files.writeStringToFile(file, file === saved ? initial : source("home"), "UTF-8"); });
var engineSource = "version: 1\nconfig:\n  frontbuilder:\n    svelte:\n      target: svelte5\n      resourceRoot: " + provider + "\n      modelPath: " + entry + "\n";
var engine = eval(String(files.readFileToString(new File(engineDir, "Engine.js"), "UTF-8")));
var drafts = {}, removals = [];
function assert(value, message) { if (!value) throw new Error(message); }
function request(options) { return Object.assign({ target: "engine", engineSource: engineSource, projectDir: __flowProjectDir,
	frontendSourceDrafts: drafts, sourceRemovals: removals, surface: "frontend", builder: "svelte",
	includeFrontendCatalog: false, includeFlowCatalog: false, includeBindings: false, includeTree: false }, options || {}); }
function call(method, options) {
	var result = JSON.parse(engine[method](JSON.stringify(request(options))));
	assert(result.ok !== false, method + ": " + JSON.stringify(result)); return result;
}
function find(node, predicate) {
	if (predicate(node)) return node;
	for (var i = 0; i < (node.children || []).length; i++) { var found = find(node.children[i], predicate); if (found) return found; }
}
function tree(options) {
	var result = call("describeTree", options);
	assert(!find(result, function (node) { return node.kind === "error"; }), "Projection has no error"); return result;
}
function named(label, options) { return find(tree(options), function (node) { return node.summary === label || node.name === label; }); }
function merge(plan) {
	plan.sourceRemovals.forEach(function (path) { delete drafts[path]; if (new File(path).isFile() && removals.indexOf(path) < 0) removals.push(path); });
	Object.keys(plan.sourceChanges).forEach(function (path) { removals = removals.filter(function (old) { return old !== path; }); drafts[path] = plan.sourceChanges[path]; });
}
function rename(node, name) {
	assert(node, "Rename target exists");
	var info = JSON.parse(node.info);
	assert(info.renameMutation && info.renameMutation.target === "sources", "Provider exposes one resource intention");
	var plan = call("authoringMutate", { mutation: Object.assign({}, info.renameMutation, { value: name }) });
	merge(plan);
	var selected = find(tree(), function (candidate) { return JSON.parse(candidate.info || "{}").sourcePath === plan.selectionSourcePath; });
	assert(selected, "Returned source path selects the new folder: " + plan.selectionSourcePath);
	return selected;
}
var first = named("old");
assert(first, "Saved static route");
var renamed = rename(first, "product");
assert(!named("old") && named("product"), "Old route is masked immediately");
var parameter = rename(named("[id]"), "city");
assert(named("[city]") && !named("[id]"), "Parameter syntax is kept while its human name changes");
assert(Object.keys(drafts).length === 1 && removals.length === 1, "Repeated rename compacts the working copy");
assert(String(files.readFileToString(saved, "UTF-8")) === initial && !new File(routes, "product").exists(), "Saved source is untouched");
var readOnly = named("product", { sourceWritable: false, readOnly: true });
assert(!JSON.parse(readOnly.info).renameMutation, "Read-only projection never offers rename");
var readOnlyPlan = JSON.parse(engine.authoringMutate(JSON.stringify(request({ readOnly: true,
	mutation: Object.assign({}, JSON.parse(parameter.info).renameMutation, { value: "town" }) }))));
assert(!readOnlyPlan.ok && JSON.stringify(readOnlyPlan).indexOf("READ_ONLY_SOURCE") >= 0, "Read-only intentions are also rejected by the engine");
var before = JSON.stringify(drafts), previous = JSON.stringify(removals);
var invalid = JSON.parse(engine.authoringMutate(JSON.stringify(request({ mutation: Object.assign({}, JSON.parse(parameter.info).renameMutation, { value: "../escape" }) }))));
assert(!invalid.ok && JSON.stringify(invalid).indexOf("INVALID_SOURCE_NAME") >= 0, "Invalid names are rejected before applying");
assert(JSON.stringify(drafts) === before && JSON.stringify(removals) === previous, "Failure does not advance any draft");
drafts = {}; removals = [];
assert(named("old") && named("[id]") && !named("product"), "Reload/discard restores saved sources");
var binary = new File(routes, "old/image.bin");
var bytes = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 3); bytes[0] = 0; bytes[1] = -1; bytes[2] = 1;
files.writeByteArrayToFile(binary, bytes);
var blocked = JSON.parse(engine.authoringMutate(JSON.stringify(request({ mutation: Object.assign({}, JSON.parse(named("old").info).renameMutation, { value: "product" }) }))));
assert(!blocked.ok && JSON.stringify(blocked).indexOf("SOURCE_RELOCATION_NON_TEXT") >= 0, "Binary assets are refused, not corrupted");
files.deleteDirectory(original.toFile()); java.nio.file.Files.delete(root.toPath()); java.nio.file.Files.delete(sandbox);
print("source-relocation-contract OK (descriptor -> rename -> draft -> AST -> discard)");
