// authoring-palette({ query: "FileDownload" }) on the Events of a page answered 0 items without a word: FileDownload is
// an action, which goes inside an event handler, and the agent had to find file.download with flow-block-get. A query
// whose candidates the focused node does not take now answers them in queryElsewhere, with a hint naming where they go
// (the handlers under the focus when it has some); at the handler, the palette offers it.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var projectDirFile = java.nio.file.Files.createTempDirectory("lib-flow-engine-palette-elsewhere-").toFile();
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
	var tree = JSON.parse(engine.authoringTree(JSON.stringify(Object.assign({}, request, { detail: "full" }))));
	var handler = findNode(tree, function (node) { return node.kind === "frontendEventBlock" && node.type === "OnClick"; });
	var events = findNode(tree, function (node) {
		return node.kind === "frontendEvents" && findNode(node, function (child) { return child === handler; }) !== null;
	});
	assert(handler && events, "the page has its Events and its OnClick handler");

	var onEvents = JSON.parse(engine.authoringPalette(JSON.stringify(Object.assign({}, request, { focusPath: events.path, query: "FileDownload" }))));
	assert(onEvents.ok === true && onEvents.eligibleCount === 0, "the Events take no action: " + JSON.stringify(onEvents).substring(0, 400));
	var elsewhere = (onEvents.queryElsewhere || []).filter(function (item) { return item.tag === "FileDownload"; })[0];
	assert(elsewhere && elsewhere.id === "flow.block.file.download" && elsewhere.targetKinds.indexOf("frontendEventBlock") >= 0,
		"the query names FileDownload and where it goes: " + JSON.stringify(onEvents.queryElsewhere));
	assert(/FileDownload is an action/.test(onEvents.hint || "") && String(onEvents.hint).indexOf(handler.path) >= 0,
		"the hint names the handler to call the palette on: " + onEvents.hint);

	var onHandler = JSON.parse(engine.authoringPalette(JSON.stringify(Object.assign({}, request, { focusPath: handler.path, query: "FileDownload" }))));
	assert(onHandler.items.some(function (item) { return item.id === "flow.block.file.download"; }),
		"the handler offers FileDownload: " + JSON.stringify(onHandler).substring(0, 400));
	assert(onHandler.queryElsewhere === undefined && onHandler.hint === undefined, "no hint when the palette answers");
	var nothing = JSON.parse(engine.authoringPalette(JSON.stringify(Object.assign({}, request, { focusPath: events.path, query: "NoSuchThingAnywhere" }))));
	assert(nothing.eligibleCount === 0 && nothing.queryElsewhere === undefined, "a query that names nothing has no elsewhere");

	print("palette-query-elsewhere OK (" + checks + " checks)");
} finally {
	files.deleteQuietly(projectDirFile);
}
