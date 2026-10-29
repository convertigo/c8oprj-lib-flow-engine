// A lazy picker request lists the same binding sources as the full contract, with
// the paths of the sources its value reads; the others are listed on demand, from
// caches kept per revision of the provider document.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var __flowEngineDir = engineDir;
var resourceRoot = String(Packages.java.lang.System.getenv("FLOW_FRONTBUILDER_RESOURCE_ROOT") || "");
if (!resourceRoot) {
	throw new Error("FLOW_FRONTBUILDER_RESOURCE_ROOT is required");
}
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var root = new java.io.File(Packages.java.lang.System.getProperty("java.io.tmpdir"), "flow-binding-lazy-engine").getCanonicalFile();
if (root.isDirectory()) {
	FileUtils.deleteDirectory(root);
}
var model = new java.io.File(root, "_flow/frontbuilder/svelte/model/LazyBindings/src/routes/+page.flow.svelte");
model.getParentFile().mkdirs();
function writeModel(title) {
	FileUtils.writeStringToFile(model, [
		'<script module>export const _flow = { sourceVersion: 2 };</script><FlowComponent $$id="home" label="Home">',
		'  <Variables>',
		'    <State $$id="profile" type="object" value={{"name": "Ada", "address": {"city": "Paris", "zip": "75001"}, "tags": ["a"]}} />',
		'    <State $$id="query" type="string" value="" />',
		'  </Variables>',
		'  <Structure><Text $$id="title" text="' + title + '" /></Structure>',
		'</FlowComponent>',
		''
	].join("\n"), "UTF-8");
}
writeModel("Lazy bindings");
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

function assertTrue(value, message) {
	if (!value) throw new Error(message);
}
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
function nodeInfo(node) {
	return node && (typeof node.info === "string" ? JSON.parse(node.info) : node.info) || {};
}
var tree = JSON.parse(engine.authoringTree(JSON.stringify({
	surface: "frontend", builder: "svelte", engineSource: engineSource, projectDir: String(root.getAbsolutePath()), detail: "full"
})));
var focusPath = findNode(tree, "title").path;
function sources(options) {
	var request = {
		surface: "frontend", builder: "svelte", engineSource: engineSource, projectDir: String(root.getAbsolutePath()),
		focusPath: focusPath, property: "text", detail: "full", includeBindings: true,
		includeFrontendCatalog: false, includeFlowCatalog: false
	};
	Object.keys(options || {}).forEach(function (key) { request[key] = options[key]; });
	var response = JSON.parse(engine.authoringTree(JSON.stringify(request)));
	var definition = nodeInfo(findNode(response, "title")).propertyDefinitions.text;
	assertTrue(definition && Array.isArray(definition.bindingSources), "the text binding lists its sources: " + JSON.stringify(definition));
	return definition.bindingSources;
}
function byLabel(list) {
	var out = {};
	list.forEach(function (candidate) { out[candidate.label] = candidate; });
	return out;
}
function caches() {
	return JSON.parse(engine.cacheInfo()).caches;
}

var full = sources();
var fullByLabel = byLabel(full);
var profile = fullByLabel["page.profile"] || full.filter(function (candidate) { return candidate.id === "profile"; })[0];
assertTrue(profile && profile.paths && profile.paths.length > 2 && profile.bindings.length === profile.paths.length,
	"the full contract details the object state: " + JSON.stringify(full.map(function (c) { return c.label; })));

var lazy = sources({ bindingDetail: "lazy", bindingValue: "Lazy bindings" });
assertTrue(JSON.stringify(lazy.map(function (c) { return c.label; })) === JSON.stringify(full.map(function (c) { return c.label; })),
	"a lazy request lists the same sources");
var deferred = lazy.filter(function (candidate) { return candidate.pathsDeferred === true; });
assertTrue(deferred.length > 0, "a container source defers its paths");
lazy.forEach(function (candidate) {
	var complete = fullByLabel[candidate.label];
	assertTrue(candidate.bindings === undefined && candidate.leafPaths === undefined, "a lazy source carries no binding per path");
	if (complete.schema) {
		assertTrue(candidate.schema && candidate.schema.type === complete.schema.type, "a lazy source keeps its root type: " + candidate.label);
	}
	if (candidate.pathsDeferred === true) {
		assertTrue(candidate.paths === undefined, "a deferred source lists no path");
	} else if (complete.paths) {
		assertTrue(JSON.stringify(candidate.paths) === JSON.stringify(complete.paths), "an immediate source lists its paths: " + candidate.label);
	}
});

// Each deferred source, asked alone, lists the paths of the full contract.
deferred.forEach(function (candidate) {
	var detailed = byLabel(sources({ bindingDetail: "lazy", bindingDetailSources: [candidate.source] }))[candidate.label];
	assertTrue(detailed.pathsDeferred === undefined, "an asked source is detailed: " + candidate.label);
	assertTrue(JSON.stringify(detailed.paths) === JSON.stringify(fullByLabel[candidate.label].paths),
		"an asked source lists the paths of the full contract: " + candidate.label);
});

// A value read from a source details it in the first answer.
var selected = byLabel(sources({ bindingDetail: "lazy", bindingValue: JSON.stringify({ mode: "source", source: profile.source, path: [] }) }))[profile.label];
assertTrue(selected.pathsDeferred === undefined && JSON.stringify(selected.paths) === JSON.stringify(profile.paths),
	"the source of the value is detailed at once");

// Another opening of the same revision reuses the enriched sources.
var before = caches();
sources({ bindingDetail: "lazy", bindingValue: "Lazy bindings" });
var after = caches();
assertTrue(after.frontendBindingCandidates.hits > before.frontendBindingCandidates.hits
	&& after.frontendBindingCandidates.misses === before.frontendBindingCandidates.misses,
	"a second opening enriches nothing: " + JSON.stringify([before.frontendBindingCandidates, after.frontendBindingCandidates]));
assertTrue(after.frontendBindingContexts.misses === before.frontendBindingContexts.misses,
	"a second opening walks no document");

// A new revision of the source is enriched again.
writeModel("Lazy bindings, edited");
var edited = sources({ bindingDetail: "lazy", bindingValue: "" });
assertTrue(caches().frontendBindingContexts.misses > after.frontendBindingContexts.misses,
	"a new document revision computes its schemas again");
assertTrue(edited.length === lazy.length, "the edited revision lists its sources");

print("frontend-binding-lazy-engine OK");
