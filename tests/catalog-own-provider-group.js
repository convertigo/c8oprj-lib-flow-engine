// The catalog of the engine project itself: its blocks are the core group, and the empty group a project gets to
// receive its own blocks must not repeat that provider (same path: the tree showed the empty one).
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var files = Packages.org.apache.commons.io.FileUtils;
var temp = java.nio.file.Files.createTempDirectory("catalog-own-provider-").toFile();
var project = new java.io.File(temp, "lib_flow_engine");
var checks = 0;
function assert(value, label) { checks++; if (!value) throw new Error(label); }
try {
	files.copyDirectory(engineDir, new java.io.File(project, "_flow"));
	files.copyFile(new java.io.File(engineDir.getParentFile(), "c8oProject.yaml"), new java.io.File(project, "c8oProject.yaml"));
	var __flowEngineDir = String(new java.io.File(project, "_flow"));
	var __flowProjectDir = String(project);
	var engine = eval(String(files.readFileToString(new java.io.File(project, "_flow/Engine.js"), "UTF-8")));
	function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
	var catalog = api("catalog", { detail: "full" });
	assert(catalog.ok !== false && Array.isArray(catalog.groups), "catalog: " + JSON.stringify(catalog).substring(0, 300));
	var seen = {};
	catalog.groups.forEach(function (group) {
		assert(!seen[group.provider], "provider listed twice: " + group.provider + " (" + group.origin + ")");
		seen[group.provider] = true;
	});
	var own = catalog.groups.filter(function (group) { return group.provider === "lib_flow_engine"; })[0];
	assert(own && own.blocks.length > 20, "the lib_flow_engine group holds the blocks: " + (own ? own.blocks.length : "missing"));
	// the project Catalog of the Studio tree (origin project): in the engine project, its own blocks are the core ones
	var projectCatalog = api("catalog", { detail: "full", origin: "project" });
	var ownGroups = projectCatalog.groups.filter(function (group) { return group.provider === "lib_flow_engine"; });
	assert(ownGroups.length === 1 && ownGroups[0].blocks.length > 20,
		"the project Catalog of the engine project lists its blocks: " + JSON.stringify(projectCatalog.groups.map(function (group) {
			return group.provider + ":" + group.origin + ":" + group.blocks.length; })));
	print("catalog-own-provider-group OK (" + checks + " checks, " + catalog.groups.length + " groups)");
} finally { files.deleteDirectory(temp); }
