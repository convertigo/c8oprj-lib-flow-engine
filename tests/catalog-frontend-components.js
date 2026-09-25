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

var __flowEngineDir = engineDir;
var __flowProjectDir = String(project.getAbsolutePath());
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
var engineSource = "version: 1\nconfig: {}\n";

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

	var palette = JSON.parse(engine.authoringPalette(JSON.stringify({ target: "engine", engineSource: engineSource,
		surface: "virtual", focusPath: namespace.path, position: "inside",
		flowCatalogOrigin: "project", includeCatalogLibraries: false })));
	var ids = (palette.items || []).map(function (item) { return item.id; });
	assertTrue(ids.indexOf("frontbuilder.svelte.flowUiBlock") >= 0,
		"Catalog > Components offers component creation: " + JSON.stringify(ids));
	var item = palette.items.filter(function (candidate) { return candidate.id === "frontbuilder.svelte.flowUiBlock"; })[0];
	assertTrue(item.insert.__frontendCreateSource.directory === "components/${namespacePath}",
		"Components are created in the builder components directory of the defining project");
} finally {
	files.deleteQuietly(temp);
}
print("catalog-frontend-components OK");
