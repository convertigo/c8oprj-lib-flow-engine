// The catalogs read no page: a frontend code-set checks its page as a working copy (frontendSourceDrafts), and a
// Studio request carries the working copies of the pages until they are saved. The block catalog (core included)
// and the descriptors of the frontend builder leave them out of their keys, as the catalog key of the provider does:
// each check of a page reused neither, about 0.5 s on warm caches for a project of ten pages. A working copy of a
// component still changes the descriptors, and one of a block the block catalog.
// Run: java -cp <rhino:commons-io> org.mozilla.javascript.tools.shell.Main tests/catalog-key-frontend-drafts.js <engine _flow dir>
// with FLOW_FRONTBUILDER_RESOURCE_ROOT set to the resource root of the Svelte frontbuilder.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function write(file, text) { files.writeStringToFile(file, String(text), "UTF-8"); }
var providerResourceRoot = String(java.lang.System.getenv("FLOW_FRONTBUILDER_RESOURCE_ROOT") || "");
if (!providerResourceRoot) throw new Error("FLOW_FRONTBUILDER_RESOURCE_ROOT required");
var temp = java.nio.file.Files.createTempDirectory("flow-catalog-frontend-drafts-").toFile().getCanonicalFile();
var project = new java.io.File(temp, "App");
try {
	var providerProject = new java.io.File(providerResourceRoot).getCanonicalFile().getParentFile().getParentFile().getParentFile();
	java.nio.file.Files.createSymbolicLink(new java.io.File(temp, "lib_flow_frontbuilder_svelte").toPath(), providerProject.toPath());
	write(new java.io.File(project, "c8oProject.yaml"), "↑App [core.Project]:\n  ↓frontbuilder [references.ProjectSchemaReference]:\n" +
		"    projectName: lib_flow_frontbuilder_svelte\n");
	var modelPath = "_flow/frontbuilder/svelte/model/App/src/routes/+page.flow.svelte";
	var engineSource = "version: 1\nconfig:\n  frontbuilder:\n    svelte:\n      target: svelte5\n      resourceRoot: " +
		providerResourceRoot + "\n      modelPath: " + modelPath + "\n";
	write(new java.io.File(project, "_flow/engine.yaml"), engineSource);
	function page(label) {
		return "<script module>\n  export const _flow = { sourceVersion: 2 };\n</script>\n\n<FlowComponent\n  $$id=\"page\"\n  label=\"" +
			label + "\"\n>\n  <Variables />\n  <Structure />\n</FlowComponent>\n";
	}
	write(new java.io.File(project, modelPath), page("Items"));
	var blockFile = new java.io.File(project, "_flow/blocks/proof/echo.block.js");
	var blockSource = 'const _meta = { runtime: "rhino", description: "Echoes a value.", properties: { value: { kind: "value", type: "string" } }, outputs: { out: { type: "string" } } }\n' +
		'(function () { return { run: function (ctx, node) { return ctx.template(ctx.props(node).value); } }; }())';
	write(blockFile, blockSource);
	var componentFile = new java.io.File(project, "_flow/frontbuilder/svelte/components/Badge.flow.svelte");
	function component(label) {
		return "<script module>\n  export const _meta = {\n    id: \"app.badge\",\n    tag: \"Badge\",\n    label: \"" + label +
			"\",\n    insert: { id: \"badge\", kind: \"badge\", tag: \"Badge\" },\n    implementation: { kind: \"flow-svelte\", file: \"./Badge.flow.svelte\" }\n" +
			"  };\n</script>\n<script>let { text = \"\" } = $props();</script>\n<span>{text}</span>\n";
	}
	write(componentFile, component("Badge"));

	var __flowEngineDir = String(engineDir.getAbsolutePath());
	var __flowProjectDir = String(project.getAbsolutePath());
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function counters() {
		var info = JSON.parse(engine.cacheInfo());
		var caches = info.caches || info.result && info.result.caches || {};
		return {
			blocks: Number(caches.blocks && caches.blocks.misses || 0),
			core: Number(caches.coreBlocks && caches.coreBlocks.misses || 0),
			descriptors: Number(caches.frontendDescriptors && caches.frontendDescriptors.misses || 0)
		};
	}
	function contract(drafts) {
		var out = JSON.parse(engine.authoringContract(JSON.stringify({ projectDir: __flowProjectDir, engineSource: engineSource,
			surface: "frontend", builder: "svelte", frontendSourceDrafts: drafts })));
		var value = out.result || out;
		assert(value.ok !== false && Array.isArray(value.items), "the contract failed: " + JSON.stringify(out).substring(0, 800));
		return value;
	}
	var pagePath = String(new java.io.File(project, modelPath).getCanonicalPath());
	var otherPagePath = String(new java.io.File(project, "_flow/frontbuilder/svelte/model/App/src/routes/orders/+page.flow.svelte").getCanonicalPath());
	contract({});
	var saved = counters();
	assert(saved.descriptors > 0, "the descriptors of the builder were not computed: " + JSON.stringify(saved));
	for (var edit = 0; edit < 3; edit++) {
		var drafts = {};
		drafts[pagePath] = page("Items " + edit);
		drafts[otherPagePath] = page("Orders " + edit);
		contract(drafts);
	}
	var afterPages = counters();
	assert(afterPages.blocks === saved.blocks && afterPages.core === saved.core,
		"page working copies loaded the block catalog again: " + JSON.stringify(saved) + " -> " + JSON.stringify(afterPages));
	assert(afterPages.descriptors === saved.descriptors,
		"page working copies read the descriptors of the builder again: " + JSON.stringify(saved) + " -> " + JSON.stringify(afterPages));

	var withComponent = {};
	withComponent[pagePath] = page("Items");
	withComponent[String(componentFile.getCanonicalPath())] = component("Status badge");
	var described = contract(withComponent);
	assert(counters().descriptors > afterPages.descriptors, "a component working copy did not change the key of the descriptors");
	assert(described.items.some(function (item) { return String(item.label || "") === "Status badge"; }),
		"the descriptors do not see the component working copy");
	var withBlock = {};
	withBlock[pagePath] = page("Items");
	withBlock[String(blockFile.getCanonicalPath())] = blockSource.replace("Echoes a value.", "Echoes a value, from its working copy.");
	contract(withBlock);
	assert(counters().blocks > afterPages.blocks, "a block working copy did not change the key of the block catalog");
	print("catalog-key-frontend-drafts OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(temp);
}
