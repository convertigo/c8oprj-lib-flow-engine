// Icons are sources of the project using them, stored as SVG only: a saved source of
// the current project gets the SVG (and its set license) in <project>/_flow/icons,
// resolved from a referenced project; Studio renderings live in the server cache.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var temp = java.nio.file.Files.createTempDirectory("flow-icon-storage-").toFile();
function write(file, text) {
	files.forceMkdir(file.getParentFile());
	files.writeStringToFile(file, String(text), "UTF-8");
}
function assertTrue(condition, message) {
	if (!condition) throw new Error(message);
}
function objectValue(value) {
	return typeof value === "string" ? JSON.parse(value) : value || {};
}

var iconName = "flowtest-" + java.lang.System.nanoTime();
var library = new java.io.File(temp, "IconLib");
write(new java.io.File(library, "c8oProject.yaml"), "↑IconLib [core.Project]:\n");
write(new java.io.File(library, "_flow/icons/iconify/mdi/" + iconName + ".svg"),
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M2 2h20v20H2z"/></svg>');
write(new java.io.File(library, "_flow/icons/iconify/mdi/LICENSE.json"),
	'{ "prefix": "mdi", "license": { "title": "Apache 2.0", "spdx": "Apache-2.0" } }\n');

var app = new java.io.File(temp, "IconApp");
write(new java.io.File(app, "c8oProject.yaml"),
	"↑IconApp [core.Project]:\n  ↓IconLib_reference [references.ProjectSchemaReference]: \n    projectName: IconLib\n");
write(new java.io.File(app, "_flow/engine.yaml"), "version: 1\nconfig: {}\n");
write(new java.io.File(app, "_flow/frontbuilder/svelte/components/Badge.flow.svelte"), [
	"<script module>",
	"  export const _meta = {",
	'    "sourceVersion": 2, "kind": "widget", "runtime": "flow-svelte", "id": "app.badge", "tag": "Badge",',
	'    "label": "Badge", "icon": "mdi:' + iconName + '", "props": {}',
	"  };",
	"</script>",
	"<span>badge</span>",
	""
].join("\n"));

var __flowEngineDir = engineDir;
var __flowProjectDir = String(app.getAbsolutePath());
var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));

function find(node, predicate) {
	if (!node) return null;
	if (predicate(node)) return node;
	var children = node.children || [];
	for (var i = 0; i < children.length; i++) {
		var found = find(children[i], predicate);
		if (found) return found;
	}
	return null;
}

try {
	var tree = JSON.parse(engine.describeTree(JSON.stringify({ target: "engine", engineSource: "version: 1\nconfig: {}\n",
		includeFlowCatalog: true, flowCatalogOrigin: "project", includeCatalogLibraries: false })));
	var badge = find(tree, function (node) { return node.kind === "frontendBlock" && objectValue(node.definition).tag === "Badge"; });
	assertTrue(badge, "The Badge component is listed");
	var info = objectValue(badge.info);
	var studioSvg = String(info.iconSvg || "");
	assertTrue(studioSvg.indexOf("flow-icons-v2") >= 0 && studioSvg.indexOf("studio") >= 0,
		"The Studio rendering lives in the server cache, not in a project: " + studioSvg);
	assertTrue(String(files.readFileToString(new java.io.File(studioSvg), "UTF-8")).indexOf("#14a7cf") >= 0,
		"The Studio rendering is tinted");

	var carried = new java.io.File(app, "_flow/icons/iconify/mdi/" + iconName + ".svg");
	assertTrue(carried.isFile(), "A saved source of the project carries the icon it uses");
	assertTrue(String(files.readFileToString(carried, "UTF-8")).indexOf("currentColor") >= 0,
		"The project keeps the original SVG, not the Studio tint");
	assertTrue(new java.io.File(app, "_flow/icons/iconify/mdi/LICENSE.json").isFile(),
		"The license of the icon set travels with its icons");
	var pngs = files.listFiles(new java.io.File(app, "_flow"), ["png"], true);
	assertTrue(pngs.isEmpty(), "No PNG rendering is written into the project: " + pngs);
	assertTrue(files.listFiles(new java.io.File(library, "_flow"), ["png"], true).isEmpty(),
		"Resolving an icon never writes into a referenced project");
} finally {
	files.deleteQuietly(temp);
}
print("icon-project-storage OK");
