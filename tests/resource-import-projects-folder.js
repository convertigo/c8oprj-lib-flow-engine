// In the Studio, the Convertigo workspace of fromFile is its user folder (.metadata/.plugins/<studio plugin>), not the
// folder of the projects where a user puts the documents of a project: an agent got RESOURCE_IMPORT_SOURCE_MISSING for
// the name of a document next to the projects, RESOURCE_IMPORT_SOURCE_OUTSIDE_WORKSPACE for its absolute path, without
// the folder expected, and copied the file into the user folder to import it. fromFile now reads a file of the folder
// of the projects too (relative to the workspace first, then to it, or absolute inside one), outside hidden folders
// and the _private folders of the projects, and the errors name the two folders.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var Files = java.nio.file.Files;
var studio = Files.createTempDirectory("flow-resource-import-studio-").toFile().getCanonicalFile();
var workspace = new java.io.File(studio, ".metadata/.plugins/studio.plugin");
workspace.mkdirs();
var project = new java.io.File(studio, "Orders");
project.mkdirs();
var __flowProjectDir = String(project.getAbsolutePath());
var __flowWorkspaceDir = String(workspace.getAbsolutePath());
var __flowProjectsDir = String(studio.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function write(file, text) { file.getParentFile().mkdirs(); files.writeStringToFile(file, text, "UTF-8"); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	function refused(request, code) {
		var out = api("resourcePatch", request);
		assert(!out.ok && out.error && out.error.code === code, "Expected " + code + ": " + JSON.stringify(out));
		return out.error;
	}
	write(new java.io.File(studio, "SPECIFICATION_ORDERS.md"), "# Orders\n\nThe specification.\n");
	var relative = api("resourcePatch", { path: "docs/specification.md", fromFile: "SPECIFICATION_ORDERS.md" });
	assert(relative.ok && relative.created === true && relative.fromFile === "SPECIFICATION_ORDERS.md",
		"a document next to the projects is imported by its name: " + JSON.stringify(relative));
	var absolute = api("resourcePatch", { path: "docs/copy.md", fromFile: String(new java.io.File(studio, "SPECIFICATION_ORDERS.md").getAbsolutePath()) });
	assert(absolute.ok && absolute.created === true, "and by its absolute path: " + JSON.stringify(absolute));
	// the workspace comes first for a relative path
	write(new java.io.File(workspace, "notes.md"), "workspace");
	write(new java.io.File(studio, "notes.md"), "projects");
	var first = api("resourcePatch", { path: "docs/notes.md", fromFile: "notes.md" });
	assert(first.ok && String(files.readFileToString(new java.io.File(project, "docs/notes.md"), "UTF-8")) === "workspace", "the workspace first: " + JSON.stringify(first));

	write(new java.io.File(studio, "Other/_private/data.sql"), "private");
	refused({ path: "docs/data.sql.md", fromFile: "Other/_private/data.sql" }, "RESOURCE_IMPORT_SOURCE_PRIVATE");
	refused({ path: "docs/hidden.md", fromFile: String(new java.io.File(studio, ".metadata/hidden.md").getAbsolutePath()) }, "RESOURCE_IMPORT_SOURCE_MISSING");
	write(new java.io.File(studio, ".metadata/hidden.md"), "hidden");
	refused({ path: "docs/hidden.md", fromFile: String(new java.io.File(studio, ".metadata/hidden.md").getAbsolutePath()) }, "RESOURCE_IMPORT_SOURCE_PRIVATE");
	var missing = refused({ path: "docs/missing.md", fromFile: "missing.md" }, "RESOURCE_IMPORT_SOURCE_MISSING");
	assert(missing.message.indexOf(String(workspace.toPath().toRealPath())) > 0 && missing.message.indexOf(String(studio.toPath().toRealPath())) > 0,
		"the error names the two folders: " + missing.message);
	var outside = Files.createTempDirectory("flow-resource-import-elsewhere-").toFile().getCanonicalFile();
	write(new java.io.File(outside, "secret.md"), "outside");
	var away = refused({ path: "docs/secret.md", fromFile: String(new java.io.File(outside, "secret.md").getAbsolutePath()) }, "RESOURCE_IMPORT_SOURCE_OUTSIDE_WORKSPACE");
	assert(/the folder of the projects/.test(away.message), "the folders expected are named: " + away.message);
	files.deleteQuietly(outside);

	print("resource-import-projects-folder OK (" + checks + " checks)");
} finally {
	files.deleteQuietly(studio);
}
