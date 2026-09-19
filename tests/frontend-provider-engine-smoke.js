var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var __flowEngineDir = engineDir;
var resourceRoot = String(Packages.java.lang.System.getenv("FLOW_FRONTBUILDER_RESOURCE_ROOT") || "");
if (!resourceRoot) {
	throw new Error("FLOW_FRONTBUILDER_RESOURCE_ROOT is required");
}
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var root = new java.io.File(Packages.java.lang.System.getProperty("java.io.tmpdir"),
	"flow-provider-engine-smoke").getCanonicalFile();
if (root.isDirectory()) {
	Packages.org.apache.commons.io.FileUtils.deleteDirectory(root);
}
var model = new java.io.File(root,
	"libs/flow/frontbuilder/svelte/model/ProviderSmoke/src/routes/+page.flow.svelte");
model.getParentFile().mkdirs();
Packages.org.apache.commons.io.FileUtils.writeStringToFile(model, [
	'<FlowComponent id="home" label="Home">',
	'  <Structure><Text id="title" text="Provider smoke" /><Avatar id="avatar" variant="primary" /></Structure>',
	'</FlowComponent>',
	''
].join("\n"), "UTF-8");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(new java.io.File(model.getParentFile().getParentFile(), "theme.flow.css"), [
	"@layer flow.theme {",
	"  :root { --c8o-color-primary: #123456; --c8o-color-secondary: #0f9f91; }",
	"  [data-flow-theme=\"dark\"] { --c8o-color-primary: #abcdef; --c8o-color-secondary: #5bd4c5; }",
	"}",
	""
].join("\n"), "UTF-8");
var engine = eval(source);
var engineSource = [
	"version: 1",
	"config:",
	"  frontbuilder:",
	"    svelte:",
	"      target: svelte5",
	"      resourceRoot: " + resourceRoot,
	"      modelPath: " + String(model.getAbsolutePath()),
	""
].join("\n");
var tree = JSON.parse(engine.describeTree(JSON.stringify({
	target: "engine",
	engineSource: engineSource,
	projectDir: String(root.getAbsolutePath()),
	detail: "compact",
	maxDepth: 2
})));
var info = JSON.parse(engine.cacheInfo()).caches;
if (!tree || tree.ok === false) {
	throw new Error("frontend provider smoke did not produce a tree: " + JSON.stringify(tree));
}
var detailedTree = JSON.parse(engine.describeTree(JSON.stringify({
	target: "engine",
	engineSource: engineSource,
	projectDir: String(root.getAbsolutePath()),
	detail: "full",
	maxDepth: 12
})));
function findNode(node, id) {
	var definition = {};
	try { definition = node && typeof node.definition === "string" ? JSON.parse(node.definition) : node && node.definition || {}; }
	catch (e) {}
	if (node && (String(node.id || "") === id || String(definition.id || "") === id)) return node;
	var children = node && node.children || [];
	for (var i = 0; i < children.length; i++) {
		var found = findNode(children[i], id);
		if (found) return found;
	}
	return null;
}
var avatar = findNode(detailedTree.tree || detailedTree, "avatar");
var avatarInfo = {};
try { avatarInfo = avatar && typeof avatar.info === "string" ? JSON.parse(avatar.info) : avatar && avatar.info || {}; }
catch (e) {}
var color = avatarInfo.propertyDefinitions && avatarInfo.propertyDefinitions.variant;
if (!color || color.kind !== "binding" || color.type !== "string" || color.literalType !== "color"
		|| color.literalEditorClass !== "flow-color-editor" || color["enum"] !== undefined
		|| !color.suggestions || color.suggestions.join(",") !== "neutral,primary,secondary,success,warning,danger") {
	throw new Error("typed color binding contract was not projected through Engine: " + JSON.stringify(color));
}
var colorTokens = color.literalOptions && color.literalOptions.theme && color.literalOptions.theme.tokens || [];
var secondary = colorTokens.filter(function (token) { return token.value === "secondary"; })[0];
if (!secondary || secondary.cssVariable !== "--c8o-color-secondary"
		|| secondary.light !== "#0f9f91" || secondary.dark !== "#5bd4c5") {
	throw new Error("typed color editor did not receive the project theme: " + JSON.stringify(color.literalOptions));
}
var authoringTree = JSON.parse(engine.authoringTree(JSON.stringify({
	surface: "frontend",
	builder: "svelte",
	engineSource: engineSource,
	projectDir: String(root.getAbsolutePath()),
	detail: "full"
})));
var themeNode = findNode(authoringTree, "theme");
var authoringAvatar = findNode(authoringTree, "avatar");
var targetedAvatar = JSON.parse(engine.authoringTree(JSON.stringify({
	surface: "frontend",
	builder: "svelte",
	engineSource: engineSource,
	projectDir: String(root.getAbsolutePath()),
	focusPath: authoringAvatar && authoringAvatar.path,
	property: "variant",
	detail: "full",
	includeBindings: true,
	includeFrontendCatalog: false,
	includeFlowCatalog: false
})));
if (!findNode(targetedAvatar, "avatar")) {
	throw new Error("targeted frontend property projection did not preserve the focused source node");
}
var themePalette = JSON.parse(engine.authoringPalette(JSON.stringify({
	surface: "frontend",
	builder: "svelte",
	engineSource: engineSource,
	projectDir: String(root.getAbsolutePath()),
	focusPath: themeNode && themeNode.path
})));
if (!themePalette.items || !themePalette.items.some(function (item) {
	return item.id === "frontbuilder.svelte.theme.create" && item.category === "Themes";
}) || !themePalette.items.some(function (item) {
	return item.id === "frontbuilder.svelte.theme.copy.default";
})) {
	throw new Error("document-derived theme palette was not projected through Engine: "
		+ JSON.stringify(themePalette));
}
if (info.frontendDocumentServer.starts !== 1 || info.frontendDocumentServer.errors !== 0
		|| info.frontendDocumentServer.fallbacks !== 0 || info.frontendDocumentServer.active !== 1) {
	throw new Error("frontend provider server did not stay healthy: "
		+ JSON.stringify(info.frontendDocumentServer) + " provider=" + JSON.stringify(info.frontendProvider));
}
if (info.frontendProvider.compiledSelections < 1 || info.frontendProvider.valid < 1
		|| info.frontendProvider.stale !== 0 || info.frontendProvider.corrupt !== 0) {
	throw new Error("frontend provider manifest was not selected: " + JSON.stringify(info.frontendProvider));
}
// The public mutation response must contain a fresh projection for the Studio,
// not only the correct source string produced by the canonical serializer.
var reusable = new java.io.File(model.getParentFile().getParentFile(), "lib/components/Reusable.flow.svelte");
reusable.getParentFile().mkdirs();
var reusableSource = '<FlowComponent id="reusable"><Structure><Text id="first" text="First" /><Text id="last" text="Last" /></Structure></FlowComponent>';
Packages.org.apache.commons.io.FileUtils.writeStringToFile(reusable, reusableSource, "UTF-8");
var projectionRoot = "frontends.svelte.library.uiBlocks.reusable";
var moved = JSON.parse(engine.applySourceMutation(JSON.stringify({
	sourceFile: String(reusable.getCanonicalPath()), source: reusableSource,
	engineSource: engineSource, projectDir: String(root.getAbsolutePath()),
	authoringRootPath: projectionRoot,
	mutation: { op: "move", from: "frontAst.slots.structure.children[1]", fromId: "last",
		path: "frontAst.slots.structure.children", index: 0 }
})));
if (!moved.ok || !moved.authoringTree || !moved.authoringTree.ok
		|| moved.authoringTree.children.length !== 1 || moved.authoringTree.children[0].path !== projectionRoot
		|| !findNode(moved.authoringTree, "last")) {
	throw new Error("canonical mutation did not return the component projection: " + JSON.stringify(moved.authoringTree || moved));
}
if (String(Packages.org.apache.commons.io.FileUtils.readFileToString(reusable, "UTF-8")) !== reusableSource) {
	throw new Error("draft mutation unexpectedly wrote the component source");
}
function projectedShape(node) {
	return { path: node.path, kind: node.kind, type: node.type, summary: node.summary,
		children: (node.children || []).map(projectedShape) };
}
function sourceRoot(tree, file) {
	var nodeInfo = {};
	try { nodeInfo = JSON.parse(tree.info || "{}"); } catch (ignored) {}
	if ((tree.kind === "frontendPage" || tree.kind === "frontendRouteLayout" || tree.kind === "frontendComponent") && nodeInfo.sourcePath &&
			String(new java.io.File(nodeInfo.sourcePath).getCanonicalPath()) === String(file.getCanonicalPath())) return tree;
	var children = tree.children || [];
	for (var i = 0; i < children.length; i++) {
		var found = sourceRoot(children[i], file);
		if (found) return found;
	}
	return null;
}
// Compare incremental and full projections, not just whether a node is present.
[reusable, model, new java.io.File(model.getParentFile(), "+layout.flow.svelte")].forEach(function (file) {
	var fileSource = reusableSource.replace('id="reusable"', 'id="' + (file === reusable ? "reusable" : String(file.getName()).indexOf("layout") >= 0 ? "layout" : "page") + '"');
	Packages.org.apache.commons.io.FileUtils.writeStringToFile(file, fileSource, "UTF-8");
	var treeRequest = { target: "engine", engineSource: engineSource, projectDir: String(root.getAbsolutePath()),
		detail: "full", includeBindings: false, includeFrontendCatalog: false, includeFlowCatalog: false };
	var initialTree = JSON.parse(engine.describeTree(JSON.stringify(treeRequest)));
	var initialRoot = sourceRoot(initialTree, file);
	if (!initialRoot) throw new Error("missing source root for " + file);
	var response = JSON.parse(engine.applySourceMutation(JSON.stringify({
		sourceFile: String(file.getCanonicalPath()), source: fileSource,
		engineSource: engineSource, projectDir: String(root.getAbsolutePath()), authoringRootPath: initialRoot.path,
		mutation: { op: "move", from: "frontAst.slots.structure.children[1]", path: "frontAst.slots.structure.children", index: 0 }
	})));
	if (!response.ok || !response.authoringTree || !response.authoringTree.ok) {
		throw new Error("source mutation projection failed for " + file + ": " + JSON.stringify({rootPath: initialRoot.path, rootKind: initialRoot.kind, response: response}));
	}
	var drafts = {};
	drafts[String(file.getCanonicalPath())] = response.source;
	treeRequest.frontendSourceDrafts = drafts;
	var fullRoot = sourceRoot(JSON.parse(engine.describeTree(JSON.stringify(treeRequest))), file);
	var incrementalRoot = response.authoringTree.children[0];
	if (!fullRoot || JSON.stringify(projectedShape(fullRoot)) !== JSON.stringify(projectedShape(incrementalRoot))) {
		throw new Error("incremental/full source projection mismatch for " + file + ": " + JSON.stringify({
			full: fullRoot && projectedShape(fullRoot), incremental: projectedShape(incrementalRoot) }));
	}
	var movedLast = findNode(response.authoringTree, "last");
	var movedFirst = findNode(response.authoringTree, "first");
	if (!movedLast || !movedFirst || JSON.parse(movedLast.info).sourceMutationPath.indexOf("children[0]") === -1
			|| JSON.parse(movedFirst.info).sourceMutationPath.indexOf("children[1]") === -1) {
		throw new Error("projected source did not expose the new sibling order");
	}
});
// Same public path, version 2: the shared codec must reach both provider CLIs.
var modernSource = '<script module>export const _flow = {sourceVersion:2};</script>\n'
	+ '<FlowComponent $$id="modern"><Structure><Input $$id="editorNode" id="businessId" disabled={true} '
	+ '$$$id="businessDouble" /></Structure></FlowComponent>';
Packages.org.apache.commons.io.FileUtils.writeStringToFile(model, modernSource, "UTF-8");
engine.cacheClear();
var modernTreeRequest = { target: "engine", engineSource: engineSource, projectDir: String(root.getAbsolutePath()),
	detail: "full", includeBindings: false, includeFrontendCatalog: false, includeFlowCatalog: false };
var modernTree = JSON.parse(engine.describeTree(JSON.stringify(modernTreeRequest)));
var editor = findNode(modernTree, "editorNode");
if (!editor) throw new Error("V2 provider identity missing: " + JSON.stringify(modernTree));
var editorDefinition = JSON.parse(editor.definition), editorInfo = JSON.parse(editor.info);
if (editorDefinition.props.id !== "businessId" || editorDefinition.props.disabled !== true
		|| editorDefinition.props.$$id !== "businessDouble" || editorDefinition.disabled === true
		|| editorInfo.propertyDefinitions.id.definitionPath !== "props.id"
		|| editorInfo.propertyDefinitions.$$id.definitionPath !== "id"
		|| editorInfo.propertyDefinitions.$$$id.definitionPath !== "props.$$id") {
	throw new Error("V2 Engine property projection conflated namespaces: " + JSON.stringify({ definition: editorDefinition, info: editorInfo }));
}
var modernRoot = sourceRoot(modernTree, model);
var modernEdited = JSON.parse(engine.applySourceMutation(JSON.stringify({
	sourceFile: String(model.getCanonicalPath()), source: modernSource,
	engineSource: engineSource, projectDir: String(root.getAbsolutePath()), authoringRootPath: modernRoot.path,
	mutation: { op: "replace", path: editorInfo.sourcePropertyMutationPaths.id, value: "editedBusiness" }
})));
if (!modernEdited.ok || !modernEdited.authoringTree || !modernEdited.authoringTree.ok
		|| !findNode(modernEdited.authoringTree, "editorNode")
		|| JSON.parse(findNode(modernEdited.authoringTree, "editorNode").definition).props.id !== "editedBusiness") {
	throw new Error("V2 public mutation did not preserve identity: " + JSON.stringify(modernEdited));
}
var modernDisabled = JSON.parse(engine.applySourceMutation(JSON.stringify({
	sourceFile: String(model.getCanonicalPath()), source: modernEdited.source,
	engineSource: engineSource, projectDir: String(root.getAbsolutePath()), authoringRootPath: modernRoot.path,
	mutation: { op: "setEnabled", path: editorInfo.sourceMutationPath, enabled: false }
})));
if (!modernDisabled.ok || String(modernDisabled.source).indexOf("$$disabled={true}") < 0
		|| String(modernDisabled.source).indexOf('id="editedBusiness"') < 0) {
	throw new Error("V2 public disable mutation failed: " + JSON.stringify(modernDisabled));
}
if (String(Packages.org.apache.commons.io.FileUtils.readFileToString(model, "UTF-8")) !== modernSource) {
	throw new Error("V2 draft mutation wrote persisted source");
}
engine.cacheClear();
Packages.org.apache.commons.io.FileUtils.deleteDirectory(root);
print("frontend-provider-engine-smoke OK " + JSON.stringify({
	server: info.frontendDocumentServer,
	provider: info.frontendProvider
}));
