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
	'  <Structure><Text id="title" text="Provider smoke" /></Structure>',
	'</FlowComponent>',
	''
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
