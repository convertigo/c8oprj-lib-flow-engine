// The frontend descriptors of a builder are kept between palettes while the fingerprint of what
// they are read from does not change: a component edited on disk, a component draft or its discard is seen
// by the next palette.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var temp = java.nio.file.Files.createTempDirectory("flow-descriptors-cache-").toFile();
var project = new java.io.File(temp, "DescriptorsApp");
function write(relative, text) {
	var file = new java.io.File(project, relative);
	files.forceMkdir(file.getParentFile());
	files.writeStringToFile(file, String(text), "UTF-8");
	return file;
}
function assertTrue(condition, message) {
	if (!condition) throw new Error(message);
}
function badge(label) {
	return [
		"<script module>",
		"  export const _meta = {",
		'    "sourceVersion": 2,',
		'    "kind": "widget",',
		'    "runtime": "flow-svelte",',
		'    "id": "project.badge",',
		'    "label": "' + label + '",',
		'    "props": { "text": { "label": "Text", "type": "string", "default": "" } },',
		"  };",
		"</script>",
		"<script>let { text = \"\" } = $props();</script>",
		"<span class=\"badge\">{text}</span>",
		""
	].join("\n");
}

var providerResourceRoot = String(java.lang.System.getenv("FLOW_FRONTBUILDER_RESOURCE_ROOT") || "");
if (!providerResourceRoot) throw new Error("FLOW_FRONTBUILDER_RESOURCE_ROOT required");
var providerProject = new java.io.File(providerResourceRoot).getParentFile().getParentFile().getParentFile();
java.nio.file.Files.createSymbolicLink(new java.io.File(temp, "lib_flow_frontbuilder_svelte").toPath(), providerProject.toPath());
write("c8oProject.yaml", "↑DescriptorsApp [core.Project]:\n  ↓frontbuilder [references.ProjectSchemaReference]:\n    projectName: lib_flow_frontbuilder_svelte\n");
var modelPath = "_flow/frontbuilder/svelte/model/DescriptorsApp/src/routes/+page.flow.svelte";
write("_flow/engine.yaml", [
	"version: 1",
	"config:",
	"  frontbuilder:",
	"    svelte:",
	"      target: svelte5",
	"      resourceRoot: " + providerResourceRoot,
	"      modelPath: " + modelPath,
	""
].join("\n"));
write(modelPath, '<script module>export const _flow = { sourceVersion: 2 };</script>\n<FlowComponent $$id="home"><Structure /></FlowComponent>\n');
var component = write("_flow/frontbuilder/svelte/components/Badge.flow.svelte", badge("First badge"));

try {
	var __flowEngineDir = engineDir;
	var __flowProjectDir = String(project.getAbsolutePath());
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function badgeLabel(extra) {
		var request = Object.assign({ surface: "frontend", builder: "svelte", query: "badge",
			focusPath: "frontends.svelte.routes.page_src_routes_page_flow_svelte.structure" }, extra || {});
		var palette = JSON.parse(engine.authoringPalette(JSON.stringify(request)));
		assertTrue(palette.ok, "palette: " + JSON.stringify(palette).substring(0, 600));
		var labels = (palette.items || []).filter(function (item) { return String(item.id || "") === "project.badge"; })
			.map(function (item) { return item.label; });
		return labels.join(",");
	}

	assertTrue(badgeLabel() === "First badge", "the project component: " + badgeLabel());
	// same size, same date: the fingerprint does not change, the descriptors are not read again
	var stamp = component.lastModified();
	files.writeStringToFile(component, badge("Firzt badge"), "UTF-8");
	component.setLastModified(stamp);
	assertTrue(badgeLabel() === "First badge", "kept while the fingerprint is the same: " + badgeLabel());

	files.writeStringToFile(component, badge("Second badge, edited"), "UTF-8");
	assertTrue(badgeLabel() === "Second badge, edited", "a component edited on disk: " + badgeLabel());

	var drafts = {};
	drafts[String(component.getCanonicalPath())] = badge("Draft badge");
	assertTrue(badgeLabel({ sourceDrafts: drafts }) === "Draft badge", "a component draft: " + badgeLabel({ sourceDrafts: drafts }));
	assertTrue(badgeLabel() === "Second badge, edited", "its discard: " + badgeLabel());
	print("frontend-descriptors-cache: edits, drafts and discards reach the palette");
} finally {
	files.deleteQuietly(temp);
}
