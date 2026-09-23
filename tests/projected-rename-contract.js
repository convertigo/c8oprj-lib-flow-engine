var engineDir = new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsoluteFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var __flowProjectDir = String(java.nio.file.Files.createTempDirectory("flow-rename-contract-"));
var engine = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
function assert(value, message) { if (!value) throw new Error(message); }
function call(method, request) {
	var result = JSON.parse(engine[method](JSON.stringify(request)));
	assert(result.ok !== false, method + ": " + JSON.stringify(result));
	return result;
}
function find(node, path) {
	if (node.path === path) return node;
	for (var i = 0; i < (node.children || []).length; i++) {
		var found = find(node.children[i], path);
		if (found) return found;
	}
}
var source = 'const _flow = { sourceVersion: 2 };\nfunction Demo() { log({ $$id: "before", message: "Hello" }); }';
var request = { target: "flow", flowSource: source, flowName: "Demo" };
var tree = call("describeTree", request);
var info = JSON.parse(find(tree, "nodes[0]").info);
assert(info.renameValue === "before", "Projected editable name");
assert(info.renameMutation.path === "nodes[0].id", "Exact AST identity path");
assert(info.propertyDefinitions.$$comment && !info.propertyDefinitions.$$comment.hidden,
	"Comment must be published by the provider on every surface");
var renamed = call("applyMutation", Object.assign({}, request, { mutation: Object.assign({}, info.renameMutation, { value: "after" }) }));
assert(renamed.source.indexOf('$$id: "after"') >= 0, "Canonical v2 identity written");
assert(renamed.selectionMutationPath === "nodes[0]", "Renamed node remains selected");
assert(JSON.parse(find(renamed, "nodes[0]").info).renameValue === "after", "Fresh rename capability");
var commented = call("applyMutation", Object.assign({}, request, { flowSource: renamed.source,
	mutation: { op: "replace", path: "nodes[0].comment", value: "Human note" } }));
assert(find(commented, "nodes[0]").summary === find(renamed, "nodes[0]").summary,
	"Comment preserves provider summary");
assert(JSON.parse(find(commented, "nodes[0]").definition).comment === "Human note", "Fresh projected comment");
var config = { target: "engine", engineSource: "version: 1\nconfig:\n  group:\n    setting: value\n" };
var configTree = call("describeTree", config);
var configInfo = JSON.parse(find(configTree, "config.group").info);
assert(configInfo.renameValue === "group", "Config projected name");
var configRenamed = call("applyMutation", Object.assign({}, config, { mutation: Object.assign({}, configInfo.renameMutation, { value: "renamed" }) }));
assert(configRenamed.selectionMutationPath === "config.renamed", "Config provider returns new selection");
assert(!!find(configRenamed, "config.renamed.setting"), "Rename preserves descendants");
print("projected-rename-contract OK");
