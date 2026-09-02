var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var resourceRoot = String(Packages.java.lang.System.getenv("FLOW_FRONTBUILDER_RESOURCE_ROOT") || "");
if (!resourceRoot) {
	throw new Error("FLOW_FRONTBUILDER_RESOURCE_ROOT is required");
}
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var root = new java.io.File(Packages.java.lang.System.getProperty("java.io.tmpdir"),
	"flow-provider-engine-smoke");
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
engine.cacheClear();
Packages.org.apache.commons.io.FileUtils.deleteDirectory(root);
print("frontend-provider-engine-smoke OK " + JSON.stringify({
	server: info.frontendDocumentServer,
	provider: info.frontendProvider
}));
