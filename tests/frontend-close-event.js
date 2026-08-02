var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var engineFile = new java.io.File(engineDir, "Engine.js");
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(engineFile, "UTF-8"));
var projectDirFile = new java.io.File(java.lang.System.getProperty("java.io.tmpdir"),
	"lib-flow-engine-frontend-close-event-test");
if (projectDirFile.isDirectory()) {
	Packages.org.apache.commons.io.FileUtils.deleteDirectory(projectDirFile);
}
projectDirFile.mkdirs();
var __flowEngineDir = engineDir;
var __flowProjectDir = String(projectDirFile.getAbsolutePath());
var engine = eval(source);

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function findNode(node, predicate) {
	if (!node) {
		return null;
	}
	if (predicate(node)) {
		return node;
	}
	var children = node.children || [];
	for (var i = 0; i < children.length; i++) {
		var found = findNode(children[i], predicate);
		if (found) {
			return found;
		}
	}
	return null;
}

function nodeDefinition(node) {
	return node && node.definition ? JSON.parse(node.definition) : {};
}

function nodeInfo(node) {
	return node && node.info ? JSON.parse(node.info) : {};
}

function sameFile(left, right) {
	return String(new java.io.File(String(left || "")).getCanonicalPath()) ===
		String(new java.io.File(String(right || "")).getCanonicalPath());
}

var frontendRoot = new java.io.File(projectDirFile, "libs/flow/frontbuilder/svelte");
var modelDir = new java.io.File(frontendRoot, "model");
modelDir.mkdirs();
var componentFile = new java.io.File(modelDir, "CloseProvider.flow.svelte");
Packages.org.apache.commons.io.FileUtils.writeStringToFile(componentFile, [
	"<FlowComponent id=\"closeProvider\" label=\"Close provider\">",
	"  <Structure>",
	"    <Button id=\"dialog\" label=\"Dialog\">",
	"      <Events>",
	"        <OnClose id=\"closed\"><Actions /></OnClose>",
	"      </Events>",
	"    </Button>",
	"  </Structure>",
	"</FlowComponent>",
	""
].join("\n"), "UTF-8");

var engineSource = [
	"version: 1",
	"config:",
	"  frontbuilder:",
	"    svelte:",
	"      target: svelte5",
	"      resourceRoot: libs/flow/frontbuilder/svelte",
	"      modelPath: libs/flow/frontbuilder/svelte/model/CloseProvider.flow.svelte",
	""
].join("\n");
var request = {
	surface: "frontend",
	builder: "svelte",
	engineSource: engineSource,
	projectDir: __flowProjectDir
};

var contract = JSON.parse(engine.authoringContract(JSON.stringify(request)));
var closeContract = contract.items.filter(function (item) {
	return item.tag === "OnClose";
})[0];
assertTrue(contract.ok === true && closeContract && closeContract.id === "frontbuilder.svelte.onclose" &&
	closeContract.slots.actions && closeContract.properties.event.type === "string",
	"authoring contract did not expose the generic OnClose event");

var tree = JSON.parse(engine.authoringTree(JSON.stringify(Object.assign({}, request, { detail: "full" }))));
var closeNode = findNode(tree, function (node) {
	return node.kind === "frontendEventBlock" && node.type === "OnClose";
});
var closeDefinition = nodeDefinition(closeNode);
var closeInfo = nodeInfo(closeNode);
assertTrue(closeNode && closeDefinition.sourceWritable === true &&
	closeInfo.sourceOrigin === "project" && sameFile(closeInfo.sourcePath, componentFile),
	"source-backed OnClose event was not projected from its provider: " +
	JSON.stringify({ node: closeNode, definition: closeDefinition, info: closeInfo }));

var closeEvents = findNode(tree, function (node) {
	return node.kind === "frontendEvents" && findNode(node, function (candidate) {
		return candidate.kind === "frontendEventBlock" && candidate.type === "OnClose";
	}) !== null;
});
assertTrue(closeEvents && closeEvents.path, "projected OnClose event did not expose its Events palette target");

var palette = JSON.parse(engine.authoringPalette(JSON.stringify(Object.assign({}, request, {
	focusPath: closeEvents.path,
	query: "OnClose"
}))));
var closePalette = palette.items.filter(function (item) {
	return item.id === "frontbuilder.svelte.onclose";
})[0];
assertTrue(palette.ok === true && closePalette && closePalette.insert.tag === "OnClose" &&
	closePalette.insert.kind === "event" && closePalette.insert.event === "close",
	"authoring palette did not expose the generic OnClose insertion");

print("frontend-close-event OK");
