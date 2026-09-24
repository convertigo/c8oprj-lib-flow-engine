// Real Rhino + Node provider, no source publication outside the temporary fixture.
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var __flowEngineDir = String(engineDir);
var files = Packages.org.apache.commons.io.FileUtils;
var sandbox = java.nio.file.Files.createTempDirectory("flow-source-create-");
var original = java.nio.file.Files.createDirectory(sandbox.resolve("project"));
var root = java.nio.file.Files.createSymbolicLink(sandbox.resolve("linked-project"), original).toFile();
var __flowProjectDir = String(root);
var resourceRoot = String(new java.io.File(arguments[1]).getCanonicalPath());
var page = new java.io.File(root, "_flow/frontbuilder/svelte/model/Proof/src/routes/+page.flow.svelte");
page.getParentFile().mkdirs();
files.writeStringToFile(page, '<script module>export const _flow = { sourceVersion: 2 };</script>\n<FlowComponent $$id="home"><Structure /></FlowComponent>\n', "UTF-8");
var engineSource = "version: 1\nconfig:\n  frontbuilder:\n    svelte:\n      target: svelte5\n      resourceRoot: " + resourceRoot + "\n      modelPath: " + page + "\n";
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var drafts = {};
function assert(value, message) { if (!value) throw new Error(message); }
function request() { return { target: "engine", engineSource: engineSource, projectDir: __flowProjectDir,
	frontendSourceDrafts: drafts, surface: "frontend", builder: "svelte", includeFrontendCatalog: false,
	includeFlowCatalog: false, includeBindings: false, includeTree: false }; }
function call(method, options) {
	var response = JSON.parse(engine[method](JSON.stringify(Object.assign(request(), options || {}))));
	assert(response.ok !== false, method + ": " + JSON.stringify(response));
	return response;
}
function find(node, predicate) {
	if (predicate(node)) return node;
	for (var i = 0; i < (node.children || []).length; i++) {
		var found = find(node.children[i], predicate); if (found) return found;
	}
}
function sourcePath(node) { return JSON.parse(node.info || "{}").sourcePath || ""; }
function tree() {
	var result = call("describeTree");
	var error = find(result, function (node) { return node.kind === "error"; });
	assert(!error, "No source projection error: " + JSON.stringify(error));
	return result;
}
function create(focus, id) {
	var palette = call("authoringPalette", { focusPath: focus.path, detail: "normal" });
	var item = palette.items.filter(function (entry) { return entry.id === "frontbuilder.svelte." + id; })[0];
	assert(item && item.authoringAction, "Creation is a provider action: " + id + " " + JSON.stringify(palette));
	var declaration = JSON.parse(String(files.readFileToString(new java.io.File(resourceRoot, "ui/definitions/" + id + ".uiblock.json"), "UTF-8")));
	assert(item.description === declaration.description, "Palette docs come from the shared source descriptor");
	assert(item.documentation && item.documentation.properties.length === Object.keys(declaration.properties).length,
		"The palette documents every declared property");
	var result = call("authoringMutate", { action: Object.assign({}, item.authoringAction,
		{ targetPath: focus.path, targetSlotId: item.targetSlot.id, position: "inside" }) });
	assert(result.target === "sources" && Object.keys(result.sourceChanges).length === 1, "One source plan");
	Object.keys(result.sourceChanges).forEach(function (path) {
		assert(!new java.io.File(path).exists(), "The engine must not publish the source");
		drafts[path] = result.sourceChanges[path];
	});
	var selected = find(tree(), function (node) { return sourcePath(node) === result.selectionSourcePath; });
	assert(selected, "Created draft is discoverable/selectable: " + result.selectionSourcePath);
	var definitions = JSON.parse(selected.info || "{}").propertyDefinitions || {};
	assert(JSON.parse(selected.info).descriptorId === declaration.id, "The generic projection retains the descriptor identity");
	Object.keys(declaration.properties).forEach(function (key) {
		assert(definitions[key], "The created source exposes the declared property: " + key);
		assert(definitions[key].description === declaration.properties[key].description,
			"Tree and palette share the property documentation: " + key);
	});
	return selected;
}
var routes = find(tree(), function (node) { return node.kind === "frontendRoutes"; });
assert(routes, "Routes tree");
var segment = create(routes, "routeSegment");
assert(!new java.io.File(sourcePath(segment)).exists(), "Draft directory not published");
var createdPage = create(segment, "page");
var canonicalPage = String(new java.io.File(sourcePath(createdPage)).getCanonicalPath());
assert(drafts[canonicalPage].indexOf("sourceVersion: 2") >= 0 && drafts[canonicalPage].indexOf('$$id="page"') >= 0,
	"New sources use the current identity contract");
var edited = call("applySourceMutation", { sourceFile: sourcePath(createdPage), source: drafts[canonicalPage],
	mutation: { op: "replace", path: "frontAst.props.label", value: "Draft page" } });
drafts[canonicalPage] = edited.source;
assert(edited.source.indexOf('label="Draft page"') >= 0 && !new java.io.File(canonicalPage).exists(),
	"An unsaved source can be edited through the real provider");
create(segment, "layout");
var group = create(segment, "routeGroup");
var parameter = create(group, "routeParam");
create(parameter, "page");
var second = create(routes, "routeSegment");
assert(sourcePath(second).endsWith("/segment2"), "Collision with unsaved directory allocates next name");
var invalid = JSON.parse(engine.authoringMutate(JSON.stringify(Object.assign(request(), {
	action: { id: "frontbuilder.svelte.routeSegment", targetPath: createdPage.path, position: "inside" } }))));
assert(!invalid.ok && JSON.stringify(invalid).indexOf("INVALID_AUTHORING_ACTION") >= 0,
	"Action admission follows current slots, not the incoming action id alone");
var palette = call("authoringPalette", { focusPath: segment.path });
var pageAction = palette.items.filter(function (item) { return item.id === "frontbuilder.svelte.page"; })[0];
var collision = JSON.parse(engine.authoringMutate(JSON.stringify(Object.assign(request(), {
	action: Object.assign({}, pageAction.authoringAction, { targetPath: segment.path, position: "inside" }) }))));
assert(!collision.ok && JSON.stringify(collision).indexOf("SOURCE_ALREADY_EXISTS") >= 0, "Existing page is not overwritten");
var nativePage = new java.io.File(sourcePath(second), "+page.svelte");
drafts[String(nativePage.getCanonicalPath())] = '<script module>export const _flow = { sourceVersion: 2 };</script>\n<FlowComponent $$id="native"><Structure /></FlowComponent>\n';
var nativeCollision = JSON.parse(engine.authoringMutate(JSON.stringify(Object.assign(request(), {
	action: Object.assign({}, pageAction.authoringAction, { targetPath: second.path, position: "inside" }) }))));
assert(!nativeCollision.ok && JSON.stringify(nativeCollision).indexOf("SOURCE_ALREADY_EXISTS") >= 0,
	"Alternate source representations cannot create two pages in the same route, even in drafts");
var savedDrafts = drafts;
drafts = {};
assert(!find(tree(), function (node) { return sourcePath(node) === sourcePath(segment); }), "Reload without drafts drops new sources");
assert(!new java.io.File(sourcePath(segment)).exists(), "No directory was ever published");
Object.keys(savedDrafts).forEach(function (path) { var file = new java.io.File(path); file.getParentFile().mkdirs(); files.writeStringToFile(file, savedDrafts[path], "UTF-8"); });
assert(find(tree(), function (node) { return sourcePath(node) === sourcePath(parameter); }), "Fixture publication and reload preserve route hierarchy");
print("source-creation-contract OK (palette -> admitted action -> draft -> tree -> fixture write/reload)");
