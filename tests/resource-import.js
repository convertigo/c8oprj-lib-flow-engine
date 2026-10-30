// A document of the workspace copied into the project: resource.patch with fromFile writes its bytes as they are,
// where content and patch write normalized lines (an agent had to send a 29 KB Markdown back as content). The source is
// a file of the workspace, outside its private folders; an existing resource is replaced only with its hash.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var Files = java.nio.file.Files;
var workspace = Files.createTempDirectory("flow-resource-import-workspace-").toFile().getCanonicalFile();
var outside = Files.createTempDirectory("flow-resource-import-outside-").toFile().getCanonicalFile();
var project = new java.io.File(workspace, "projects/Orders");
project.mkdirs();
var __flowProjectDir = String(project.getAbsolutePath());
var __flowWorkspaceDir = String(workspace.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function bytesOf(text) { return new java.lang.String(text).getBytes(java.nio.charset.StandardCharsets.UTF_8); }
function write(file, text) { file.getParentFile().mkdirs(); Files.write(file.toPath(), bytesOf(text)); }
try {
	var engine = eval(String(files.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(name, request) { return JSON.parse(engine[name](JSON.stringify(request))); }
	function refused(request, code) {
		var out = api("resourcePatch", request);
		assert(!out.ok && out.error && out.error.code === code, "Expected " + code + ": " + JSON.stringify(out));
		return out;
	}
	// CRLF lines, no final new line, accented text: what an import keeps and content would normalize.
	var guide = "# Order guide\r\n\r\nDélai de livraison : 3 jours.\r\nLast line without new line";
	write(new java.io.File(workspace, "order-guide.md"), guide);

	var dry = api("resourcePatch", { path: "docs/order-guide.md", fromFile: "order-guide.md", dryRun: true });
	assert(dry.ok && dry.created && dry.dryRun && !new java.io.File(project, "docs/order-guide.md").exists(), "A dry run writes nothing: " + JSON.stringify(dry));
	var imported = api("resourcePatch", { path: "docs/order-guide.md", fromFile: "order-guide.md" });
	assert(imported.ok && imported.created === true && imported.fromFile === "order-guide.md" && imported.bytes === bytesOf(guide).length, "Import failed: " + JSON.stringify(imported));
	var target = new java.io.File(project, "docs/order-guide.md");
	assert(java.util.Arrays.equals(Files.readAllBytes(target.toPath()), bytesOf(guide)), "The import must keep the bytes of the file");
	var read = api("resourceGet", { path: "docs/order-guide.md", allowLarge: true });
	assert(read.ok && read.hash === imported.newHash, "The returned hash is the one flow-resource-get reads: " + JSON.stringify({ read: read.hash, imported: imported.newHash }));

	write(new java.io.File(workspace, "order-guide.md"), guide + "\r\nAdded later");
	refused({ path: "docs/order-guide.md", fromFile: "order-guide.md" }, "RESOURCE_BASE_HASH_REQUIRED");
	refused({ path: "docs/order-guide.md", fromFile: "order-guide.md", baseHash: "0000" }, "RESOURCE_BASE_HASH_MISMATCH");
	var replaced = api("resourcePatch", { path: "docs/order-guide.md", fromFile: "order-guide.md", baseHash: read.hash });
	assert(replaced.ok && replaced.changed === true && !replaced.created, "An import with the hash replaces the resource: " + JSON.stringify(replaced));
	var again = api("resourcePatch", { path: "docs/order-guide.md", fromFile: "order-guide.md", baseHash: replaced.newHash });
	assert(again.ok && again.changed === false, "The same bytes again change nothing: " + JSON.stringify(again));
	var absolute = api("resourcePatch", { path: "docs/copy.md", fromFile: String(new java.io.File(workspace, "order-guide.md").getAbsolutePath()) });
	assert(absolute.ok && absolute.fromFile === "order-guide.md", "An absolute path inside the workspace is accepted: " + JSON.stringify(absolute));

	write(new java.io.File(outside, "secret.md"), "outside");
	refused({ path: "docs/secret.md", fromFile: "../" + outside.getName() + "/secret.md" }, "RESOURCE_IMPORT_SOURCE_OUTSIDE_WORKSPACE");
	refused({ path: "docs/secret.md", fromFile: String(new java.io.File(outside, "secret.md").getAbsolutePath()) }, "RESOURCE_IMPORT_SOURCE_OUTSIDE_WORKSPACE");
	Files.createSymbolicLink(new java.io.File(workspace, "linked.md").toPath(), new java.io.File(outside, "secret.md").toPath());
	refused({ path: "docs/secret.md", fromFile: "linked.md" }, "RESOURCE_IMPORT_SOURCE_OUTSIDE_WORKSPACE");
	write(new java.io.File(workspace, "configuration/engine.properties"), "admin.password=x");
	refused({ path: "docs/engine.md", fromFile: "configuration/engine.properties" }, "RESOURCE_IMPORT_SOURCE_PRIVATE");
	write(new java.io.File(workspace, ".metadata/notes.md"), "hidden");
	refused({ path: "docs/notes.md", fromFile: ".metadata/notes.md" }, "RESOURCE_IMPORT_SOURCE_PRIVATE");
	refused({ path: "docs/missing.md", fromFile: "missing.md" }, "RESOURCE_IMPORT_SOURCE_MISSING");
	refused({ path: "../escape.md", fromFile: "order-guide.md" }, "INVALID_RESOURCE_PATH");
	refused({ path: ".httpignore", fromFile: "order-guide.md" }, "RESOURCE_HTTPIGNORE_PROTECTED");
	assert(!new java.io.File(project, "docs/secret.md").exists() && !new java.io.File(project, "docs/engine.md").exists(), "A refused import writes nothing");

	print("resource-import OK (" + checks + " checks)");
} finally {
	files.deleteDirectory(workspace);
	files.deleteDirectory(outside);
}
