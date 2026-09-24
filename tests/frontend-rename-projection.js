// Standalone real-provider proof; only a fresh temporary project is written.
var engineDir = new java.io.File(arguments[0]).getAbsoluteFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var sandbox = java.nio.file.Files.createTempDirectory("flow-frontend-rename-");
var original = java.nio.file.Files.createDirectory(sandbox.resolve("project"));
// Match a linked Eclipse project on every platform, not only macOS /var aliases.
var root = java.nio.file.Files.createSymbolicLink(sandbox.resolve("linked-project"), original).toFile();
var __flowProjectDir = String(root.getAbsolutePath());
var resourceRoot = String(new java.io.File(arguments[1]).getAbsolutePath());
var sourceFile = new java.io.File(root, "_flow/frontbuilder/svelte/model/RenameProof/src/routes/+page.flow.svelte");
sourceFile.getParentFile().mkdirs();
var source = '<script module>export const _flow = { sourceVersion: 2 };</script>\n'
	+ '<FlowComponent $$id="home"><Structure><Text $$id="before" id="businessId" text="Hello" /></Structure></FlowComponent>\n';
files.writeStringToFile(sourceFile, source, "UTF-8");
var engineSource = "version: 1\nconfig:\n  frontbuilder:\n    svelte:\n      target: svelte5\n      resourceRoot: " + resourceRoot
	+ "\n      modelPath: " + sourceFile.getAbsolutePath() + "\n";
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
function assert(value, message) { if (!value) throw new Error(message); }
function call(method, request) {
	var result = JSON.parse(engine[method](JSON.stringify(request)));
	assert(result.ok !== false, method + ": " + JSON.stringify(result));
	return result;
}
function find(node, predicate) {
	if (predicate(node)) return node;
	for (var i = 0; i < (node.children || []).length; i++) {
		var found = find(node.children[i], predicate);
		if (found) return found;
	}
}
var request = { target: "engine", engineSource: engineSource, projectDir: __flowProjectDir,
	detail: "full", includeFrontendCatalog: false, includeFlowCatalog: false };
var tree = call("describeTree", request);
var routes = find(tree, function (node) { return node.type === "routes"; });
assert(routes && !JSON.parse(routes.info).propertyDefinitions.root,
	"Routes must not infer an editable property from its internal root flag");
find(tree, function (node) {
	var definitions = JSON.parse(node.info || "{}").propertyDefinitions || {};
	Object.keys(definitions).forEach(function (key) {
		var definition = definitions[key];
		if (definition.hidden) return;
		assert(["Base properties", "Expert", "Information"].indexOf(definition.category) >= 0
			&& (definition.readOnly === true) === (definition.category === "Information"),
			"Property presentation follows the declared contract: " + node.path + ":" + key);
	});
	return false;
});
var page = find(tree, function (node) { return JSON.parse(node.info || "{}").sourceMutationPath === "frontAst"; });
var before = find(tree, function (node) { return JSON.parse(node.info || "{}").renameValue === "before"; });
assert(page && before, "Real provider must expose page and rename capability");
assert(JSON.parse(page.info).renameValue === "home", "Name exposes the authored root identity, not the navigation key");
assert(JSON.parse(page.info).renameMutation.path === "frontAst.id", "Root rename follows the generic authored-node contract");
assert(!Object.prototype.hasOwnProperty.call(JSON.parse(page.definition), "projectionId"),
	"Navigation bookkeeping must not enter the authored definition");
var slot = find(tree, function (node) { return JSON.parse(node.info || "{}").sourceMutationPath === "frontAst.slots.structure.children"; });
assert(slot && !JSON.parse(slot.info).renameMutation, "Slot wrappers must not advertise node rename");
var info = JSON.parse(before.info);
assert(info.propertyDefinitions.$$comment && !info.propertyDefinitions.$$comment.hidden,
	"Frontend comment is a visible provider property");
assert(info.propertyDefinitions.$$out.hidden, "A visual Text has no Output destination");
assert(info.propertyDefinitions.sourceKind.readOnly && info.propertyDefinitions.sourceKind.category === "Information",
	"Real frontend metadata is explicitly declared read-only");
assert(info.propertyDefinitions.traits.hidden && info.propertyDefinitions.slots.hidden,
	"Real frontend traits and slots are not human-editable properties");
var result = call("applySourceMutation", { sourceFile: String(sourceFile.getAbsolutePath()), source: source,
	engineSource: engineSource, projectDir: __flowProjectDir, authoringRootPath: page.path,
	mutation: Object.assign({}, info.renameMutation, { value: "after" }) });
assert(result.authoringTree && result.authoringTree.ok, "Mutation must return a valid projection");
var after = find(result.authoringTree, function (node) { return JSON.parse(node.info || "{}").renameValue === "after"; });
assert(after && after.path !== before.path, "New virtual identity returned after rename");
assert(JSON.parse(after.info).sourceMutationPath === info.sourceMutationPath, "AST location remains selectable");
assert(result.source.indexOf('$$id="after"') >= 0 && result.source.indexOf('id="businessId"') >= 0,
	"Rename changes engine identity without touching business id");
assert(String(files.readFileToString(sourceFile, "UTF-8")) === source, "Draft mutation must not write saved source");
var commented = call("applySourceMutation", { sourceFile: String(sourceFile.getAbsolutePath()), source: result.source,
	engineSource: engineSource, projectDir: __flowProjectDir, authoringRootPath: page.path,
	mutation: { op: "replace", path: info.sourceMutationPath + ".comment", value: "Human note" } });
var commentedNode = find(commented.authoringTree, function (node) { return JSON.parse(node.info || "{}").renameValue === "after"; });
assert(commentedNode && commentedNode.summary === after.summary, "Frontend comment preserves provider summary");
assert(JSON.parse(commentedNode.definition).comment === "Human note", "Frontend comment is reprojected");
var renamedRoot = call("applySourceMutation", { sourceFile: String(sourceFile.getAbsolutePath()), source: commented.source,
	engineSource: engineSource, projectDir: __flowProjectDir, authoringRootPath: page.path,
	mutation: Object.assign({}, JSON.parse(page.info).renameMutation, { value: "renamedHome" }) });
var rootAfter = find(renamedRoot.authoringTree, function (node) { return JSON.parse(node.info || "{}").renameValue === "renamedHome"; });
assert(rootAfter && rootAfter.path === page.path, "Source navigation identity remains stable after authored root rename");
assert(JSON.parse(rootAfter.definition).id === "renamedHome", "Reprojected Name uses the authored identity");
assert(renamedRoot.source.indexOf('$$id="renamedHome"') >= 0, "Root rename is persisted in the returned source");
assert(String(files.readFileToString(sourceFile, "UTF-8")) === source, "All renames remain draft-only");
print("frontend-rename-projection OK");
