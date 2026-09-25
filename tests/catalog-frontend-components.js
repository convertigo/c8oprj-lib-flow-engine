// A project defining shared frontend components (a component library, without any
// frontbuilder configuration) lists them in its own Catalog, where they are created.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var temp = java.nio.file.Files.createTempDirectory("flow-catalog-components-").toFile();
var project = new java.io.File(temp, "lib_flow_frontend_demo");
function write(relative, text) {
	var file = new java.io.File(project, relative);
	files.forceMkdir(file.getParentFile());
	files.writeStringToFile(file, String(text), "UTF-8");
}
function assertTrue(condition, message) {
	if (!condition) throw new Error(message);
}
write("c8oProject.yaml", "↑lib_flow_frontend_demo [core.Project]:\n");
write("_flow/engine.yaml", "version: 1\nconfig: {}\n");
write("_flow/frontbuilder/svelte/components/Gauge.flow.svelte", [
	"<script module>",
	"  export const _meta = {",
	'    "sourceVersion": 2,',
	'    "kind": "widget",',
	'    "runtime": "flow-svelte",',
	'    "id": "demo.gauge",',
	'    "namespace": "demo",',
	'    "label": "Gauge",',
	'    "description": "Shows a value between a minimum and a maximum.",',
	'    "props": { "value": { "label": "Value", "type": "number", "default": 0, "description": "Displayed value." } },',
	"  };",
	"</script>",
	"<script>let { value = 0 } = $props();</script>",
	"<div class=\"gauge\">{value}</div>",
	""
].join("\n"));

write("_flow/types/demo.colorPicker.type.yaml", [
	"name: demo.colorPicker",
	"label: Color picker",
	"description: Picks a color from the library palette.",
	"type: string",
	""
].join("\n"));
// A consumer project referencing the component library.
var consumer = new java.io.File(temp, "DemoApp");
files.writeStringToFile(new java.io.File(consumer, "c8oProject.yaml"),
	"↑DemoApp [core.Project]:\n  ↓lib_flow_frontend_demo_reference [references.ProjectSchemaReference]: \n    projectName: lib_flow_frontend_demo\n", "UTF-8");
files.writeStringToFile(new java.io.File(consumer, "_flow/engine.yaml"), "version: 1\nconfig: {}\n", "UTF-8");

var __flowEngineDir = engineDir;
var __flowProjectDir = String(project.getAbsolutePath());
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var engineSource = "version: 1\nconfig: {}\n";

function objectValue(value) {
	return typeof value === "string" ? JSON.parse(value) : value || {};
}

function find(node, path) {
	if (!node) return null;
	if (String(node.path || "") === path) return node;
	var children = node.children || [];
	for (var i = 0; i < children.length; i++) {
		var found = find(children[i], path);
		if (found) return found;
	}
	return null;
}

try {
	var tree = JSON.parse(engine.describeTree(JSON.stringify({ target: "engine", engineSource: engineSource,
		includeFlowCatalog: true, flowCatalogOrigin: "project", includeCatalogLibraries: false })));
	assertTrue(tree.ok === true, "Engine tree failed: " + JSON.stringify(tree).slice(0, 400));
	var components = find(tree, "catalog.components");
	assertTrue(components && components.type === "frontendCatalogComponents",
		"The Catalog must list the project's shared components without a builder configuration");
	var namespace = (components.children || []).filter(function (child) { return child.type === "frontendBlockNamespace"; })[0];
	assertTrue(namespace, "Components are grouped by namespace");
	assertTrue(JSON.stringify(namespace).indexOf("Gauge") >= 0, "The Gauge component is listed");
	var gauge = null;
	(function findGauge(node) {
		if (!node || gauge) return;
		if (node.kind === "frontendBlock" && objectValue(node.definition).label === "Gauge") gauge = node;
		(node.children || []).forEach(findGauge);
	}(namespace));
	assertTrue(gauge, "The Gauge component node is a frontendBlock");
	var gaugeInfo = objectValue(gauge.info);
	["label", "category", "icon", "description", "longDescription"].forEach(function (key) {
		var definition = (gaugeInfo.propertyDefinitions || {})[key] || {};
		assertTrue(definition.label && definition.readOnly !== true, "The component " + key + " is editable in its own library");
		assertTrue((gaugeInfo.sourcePropertyMutationPaths || {})[key] === key,
			"The component " + key + " is edited in the component header: " + JSON.stringify(gaugeInfo.sourcePropertyMutationPaths));
	});
	assertTrue(!gaugeInfo.sourceMutationPath, "The component node itself stays a file (deleted as a whole), not a source node");
	var gaugeKinds = (gauge.children || []).map(function (child) { return child.kind; });
	assertTrue(gaugeKinds.indexOf("frontendBlockImplementation") >= 0 && gaugeKinds.indexOf("error") < 0,
		"A component written in Svelte code is edited as source, not as a parsed tree: " + JSON.stringify(gaugeKinds));
	var gaugeProperties = (gauge.children || []).filter(function (child) { return child.type === "frontendBlockProperties"; })[0];
	var declared = (gaugeProperties.children || []).map(function (child) { return child.type; });
	assertTrue(declared.join(",") === "value",
		"The Catalog lists the declared properties, not the ones common to all UI blocks: " + declared);
	var propertiesPalette = JSON.parse(engine.authoringPalette(JSON.stringify({ target: "engine", engineSource: engineSource,
		surface: "virtual", focusPath: gaugeProperties.path, position: "inside",
		flowCatalogOrigin: "project", includeCatalogLibraries: false })));
	assertTrue((propertiesPalette.items || []).some(function (candidate) { return candidate.id === "frontbuilder.svelte.property"; }),
		"A component declares a new property from its Properties folder: " + JSON.stringify((propertiesPalette.items || []).map(function (c) { return c.id; })));
	assertTrue(objectValue(gaugeProperties.info).frontendInsertMutationPath === "props",
		"A new property is an entry of the component header props");

	var palette = JSON.parse(engine.authoringPalette(JSON.stringify({ target: "engine", engineSource: engineSource,
		surface: "virtual", focusPath: namespace.path, position: "inside",
		flowCatalogOrigin: "project", includeCatalogLibraries: false })));
	var ids = (palette.items || []).map(function (item) { return item.id; });
	assertTrue(ids.indexOf("frontbuilder.svelte.flowUiBlock") >= 0,
		"Catalog > Components offers component creation: " + JSON.stringify(ids));
	function createComponent(id) {
		var item = palette.items.filter(function (candidate) { return candidate.id === id; })[0];
		assertTrue(item, "Catalog > Components offers " + id + ": " + JSON.stringify(ids));
		assertTrue(item.insert.__frontendCreateSource.directory === "components/${namespacePath}",
			"Components are created in the builder components directory of the defining project");
		var created = JSON.parse(engine.authoringMutate(JSON.stringify({ target: "engine", engineSource: engineSource,
			surface: item.authoringAction.surface, includeTree: false,
			action: Object.assign({}, item.authoringAction, { targetPath: namespace.path, position: "inside" }) })));
		var createdPaths = Object.keys(created.sourceChanges || {});
		assertTrue(created.ok === true && createdPaths.length === 1,
			"Creating a component from Catalog > Components plans its source: " + JSON.stringify(created).slice(0, 600));
		assertTrue(createdPaths[0].indexOf("/lib_flow_frontend_demo/_flow/frontbuilder/svelte/components/demo/") >= 0
			&& /\.flow\.svelte$/.test(createdPaths[0]),
			"The component is created in the namespace directory of the library: " + createdPaths[0]);
		return created.sourceChanges[createdPaths[0]];
	}
	// A component is defined either in Flow (a <FlowComponent> tree) or in Svelte code,
	// both described by their header.
	var flowSource = createComponent("frontbuilder.svelte.flowUiBlock");
	assertTrue(/export const _flow = \{[\s\S]*sourceVersion: 2,[\s\S]*kind: "component"[\s\S]*id: "demo\.flowUiBlock"/.test(flowSource)
		&& flowSource.indexOf("<FlowComponent") >= 0 && flowSource.indexOf("<Structure />") >= 0,
		"A Flow component is a <FlowComponent> described by its _flow header: " + flowSource);
	var svelteSource = createComponent("frontbuilder.svelte.svelteUiBlock");
	assertTrue(/export const _meta = \{[\s\S]*sourceVersion: 2,[\s\S]*id: "demo\.svelteUiBlock"/.test(svelteSource)
		&& svelteSource.indexOf("$props()") >= 0 && svelteSource.indexOf("<FlowComponent") < 0,
		"A Svelte component is Svelte code described by its _meta header: " + svelteSource);
	var ownTypes = find(tree, "catalog.types");
	assertTrue(JSON.stringify(ownTypes).indexOf("demo.colorPicker") >= 0,
		"The library lists the types it defines for its components in its own Catalog");

	var consumerEngine = (function () {
		var __flowEngineDir = engineDir;
		var __flowProjectDir = String(consumer.getAbsolutePath());
		return eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	}());
	var consumerTree = JSON.parse(consumerEngine.describeTree(JSON.stringify({ target: "engine", engineSource: engineSource,
		includeFlowCatalog: true, includeCatalogLibraries: false })));
	var consumerTypes = find(consumerTree, "catalog.types");
	assertTrue(JSON.stringify(consumerTypes).indexOf("demo.colorPicker") >= 0,
		"A project referencing the library can use the types it shares");
	var consumerOwnTypes = find(JSON.parse(consumerEngine.describeTree(JSON.stringify({ target: "engine", engineSource: engineSource,
		includeFlowCatalog: true, flowCatalogOrigin: "project", includeCatalogLibraries: false }))), "catalog.types");
	assertTrue(JSON.stringify(consumerOwnTypes || {}).indexOf("demo.colorPicker") < 0,
		"A shared type stays defined (and edited) in the library, not in the consumer's own Catalog");
} finally {
	files.deleteQuietly(temp);
}
print("catalog-frontend-components OK");
