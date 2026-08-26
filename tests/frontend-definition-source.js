var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());

function assertTrue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

var serviceFile = new java.io.File(engineDir, "modules/flow-tree-service.js");
var flowTreeService = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(serviceFile, "UTF-8")));
var catalogServiceFile = new java.io.File(engineDir, "modules/frontend-catalog-service.js");
var frontendCatalogService = eval(String(Packages.org.apache.commons.io.FileUtils.readFileToString(catalogServiceFile, "UTF-8")));
var item = flowTreeService.descriptorItem({
	id: "svelte.datePicker",
	label: "Date picker",
	provider: "lib_flow_frontbuilder_svelte",
	builder: "svelte",
	namespace: "svelte",
	kind: "widget",
	runtime: "flow-svelte",
	sourceBacked: true,
	sourceRelativePath: "libs/flow/frontbuilder/svelte/components/DatePicker.flow.svelte",
	sourceOrigin: "library",
	sourcePath: "/workspace/git/private/DatePicker.flow.svelte",
	properties: {}
}, null, "full", {
	normalizeTree: function (value) { return value; }
});

assertTrue(item.provider === "lib_flow_frontbuilder_svelte", "Provider project was not preserved");
assertTrue(item.runtime === "flow-svelte", "Runtime kind was not preserved");
assertTrue(item.sourceRelativePath === "libs/flow/frontbuilder/svelte/components/DatePicker.flow.svelte",
	"Safe project-relative definition path was not preserved");
assertTrue(item.sourceOrigin === "library", "Source origin was not preserved");
assertTrue(item.sourcePath === undefined, "Absolute source path leaked through the public authoring palette");
assertTrue(item.definitionPath === "frontends.builder_svelte.catalog.provider_lib_flow_frontbuilder_svelte.namespace_svelte.uiBlocks.block_svelte_datePicker",
	"Frontend definition tree path was not exposed deterministically");

var providerRoot = new java.io.File(java.lang.System.getProperty("java.io.tmpdir"),
	"flow-definition-source/lib_flow_frontbuilder_svelte");
var definitionFile = new java.io.File(providerRoot,
	"libs/flow/frontbuilder/svelte/components/DatePicker.flow.svelte");
var metadata = frontendCatalogService.sourceMetadataForFile(definitionFile, "svelte", {
	File: java.io.File,
	projectDir: function () {
		return new java.io.File(java.lang.System.getProperty("java.io.tmpdir"), "flow-definition-source/sample");
	},
	projectNameForRoot: function (root) { return String(root.getName()); },
	resourceRelativePath: function (root, file) {
		return String(root.toPath().toAbsolutePath().normalize().relativize(
			file.toPath().toAbsolutePath().normalize())).replace(/\\/g, "/");
	}
}, "");
assertTrue(metadata.provider === "lib_flow_frontbuilder_svelte", "Provider project was not derived from the library root");
assertTrue(metadata.sourceOrigin === "library", "Library definition origin was not preserved");
assertTrue(metadata.sourceRelativePath === "libs/flow/frontbuilder/svelte/components/DatePicker.flow.svelte",
	"Library definition path was not made project-relative");

print(JSON.stringify({ ok: true, sourceRelativePath: item.sourceRelativePath }));
