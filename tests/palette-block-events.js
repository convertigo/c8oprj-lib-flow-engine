// A DataTable raises click, change and selectionChange, handled by OnClick, OnChange and OnSelectionChange in its
// Events: the contract of the block (authoringContract, the starter contract of code-get) and its palette item did not
// say so, the agent of a trial found them in the guide. The descriptor of a component now keeps the events of its _meta,
// the contract lists their handlers and the palette item gives each one with its label and description.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var projectDirFile = java.nio.file.Files.createTempDirectory("lib-flow-engine-palette-events-").toFile();
var __flowEngineDir = engineDir;
var __flowProjectDir = String(projectDirFile.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(condition, message) { checks++; if (!condition) throw new Error(message); }
function findNode(node, predicate) {
	if (!node) return null;
	if (predicate(node)) return node;
	var children = node.children || [];
	for (var i = 0; i < children.length; i++) {
		var found = findNode(children[i], predicate);
		if (found) return found;
	}
	return null;
}
try {
	var engine = eval(source);
	var modelDir = new java.io.File(projectDirFile, "_flow/frontbuilder/svelte/model/Orders/src/routes");
	modelDir.mkdirs();
	files.writeStringToFile(new java.io.File(modelDir, "+page.flow.svelte"), [
		"<script module>export const _flow = { sourceVersion: 2 };</script>",
		"<FlowComponent $$id=\"orders\" label=\"Orders\">",
		"  <Structure>",
		"    <Button $$id=\"export\" label=\"Export\">",
		"      <Events>",
		"        <OnClick $$id=\"exportClick\"><Actions /></OnClick>",
		"      </Events>",
		"    </Button>",
		"  </Structure>",
		"</FlowComponent>",
		""
	].join("\n"), "UTF-8");
	var request = {
		surface: "frontend",
		builder: "svelte",
		engineSource: ["version: 1", "config:", "  frontbuilder:", "    svelte:", "      target: svelte5",
			"      resourceRoot: " + String(java.lang.System.getenv("FLOW_FRONTBUILDER_RESOURCE_ROOT")),
			"      modelPath: _flow/frontbuilder/svelte/model/Orders/src/routes/+page.flow.svelte", ""].join("\n"),
		projectDir: __flowProjectDir
	};
	var contract = JSON.parse(engine.authoringContract(JSON.stringify(request)));
	var table = contract.items.filter(function (item) { return item.tag === "DataTable"; })[0];
	assert(table && JSON.stringify(table.events) === JSON.stringify(["OnClick", "OnChange", "OnSelectionChange"]),
		"the contract of DataTable lists the handlers of its events: " + JSON.stringify(table && table.events));
	assert(["source", "selectable", "selected"].every(function (name) { return table.properties[name]; }), "and its selection properties");
	var button = contract.items.filter(function (item) { return item.tag === "Button"; })[0];
	assert(button && Array.isArray(button.events), "every item has its list of handlers: " + JSON.stringify(button && button.events));

	var tree = JSON.parse(engine.authoringTree(JSON.stringify(Object.assign({}, request, { detail: "full" }))));
	var structure = findNode(tree, function (node) { return /\.structure$/.test(String(node.path || "")); });
	var palette = JSON.parse(engine.authoringPalette(JSON.stringify(Object.assign({}, request, { focusPath: structure.path, query: "DataTable" }))));
	var item = palette.items.filter(function (each) { return each.id === "svelte.dataTable"; })[0];
	assert(item && item.events && item.events.selectionChange && item.events.selectionChange.handler === "OnSelectionChange" &&
		/@event\.value/.test(item.events.selectionChange.description) && item.events.click.handler === "OnClick",
		"the palette item gives each event, its handler and what @event holds: " + JSON.stringify(item && item.events).substring(0, 400));

	print("palette-block-events OK (" + checks + " checks)");
} finally {
	files.deleteQuietly(projectDirFile);
}
