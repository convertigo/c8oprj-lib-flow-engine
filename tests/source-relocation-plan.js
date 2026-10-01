var File = java.io.File;
var files = Packages.org.apache.commons.io.FileUtils;
var engineDir = new File(arguments[0]).getCanonicalFile();
var planner = eval(String(files.readFileToString(new File(engineDir, "modules/source-relocation-plan.js"), "UTF-8")));
var views = eval(String(files.readFileToString(new File(engineDir, "modules/source-working-copies.js"), "UTF-8")));
var root = java.nio.file.Files.createTempDirectory("flow-source-rename-").toFile().getCanonicalFile();
var source = new File(root, "routes/old");
var saved = new File(source, "nested/page.txt");
saved.getParentFile().mkdirs(); files.writeStringToFile(saved, "saved é\r\n", "UTF-8");
var empty = new File(source, "empty.txt"); files.writeStringToFile(empty, "", "UTF-8");
var drafts = {}; drafts[String(saved)] = "draft é\r\n";
drafts[String(new File(source, "unsaved/file.txt"))] = "new";
function assert(value, message) { if (!value) throw new Error(message); }
function plan(overrides, request) {
	var sources = views.create(request || { sourceDrafts: drafts }, { File: File, FileUtils: files, hash: String });
	return planner.plan(Object.assign({ sourcePath: String(source), sourceRoot: String(new File(root, "routes")), value: "product" }, overrides || {}),
		{ root: String(root) }, { File: File, sources: sources,
			raise: function (code, message) { throw new Error(code + ": " + message); },
			isSymbolicLink: function (file) { return java.nio.file.Files.isSymbolicLink(file.toPath()); },
			readText: function (file) { return String(java.nio.charset.StandardCharsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(files.readFileToByteArray(file)))); } });
}
function rejects(code, overrides, request) {
	var error;
	try { plan(overrides, request); } catch (e) { error = String(e); }
	assert(error && error.indexOf(code) >= 0, "Expected " + code + ", got " + error);
}
var result = plan();
assert(result.target === "sources" && result.changed && result.sourceRemovals.length === 3, "One complete resource plan");
assert(result.sourceChanges[String(new File(root, "routes/product/nested/page.txt"))] === "draft é\r\n", "Working text is preserved byte-for-byte");
assert(result.sourceChanges[String(new File(root, "routes/product/empty.txt"))] === "", "Empty text is retained");
assert(result.sourceChanges[String(new File(root, "routes/product/unsaved/file.txt"))] === "new", "Inferred draft-only children are moved");
assert(String(files.readFileToString(saved, "UTF-8")) === "saved é\r\n" && !new File(root, "routes/product").exists(), "Planning never publishes");
assert(plan({ value: "old" }).changed === false, "Same name is a no-op");
rejects("INVALID_SOURCE_NAME", { value: "../escape" });
rejects("INVALID_SOURCE_NAME", { value: "bad name", recipe: { pattern: "^[a-z]+$" } });
rejects("INVALID_SOURCE_RELOCATION_PATH", { sourcePath: String(new File(root, "routes")) });
rejects("INVALID_SOURCE_RELOCATION_PATH", { sourceRoot: String(new File(root, "../outside")) });
rejects("SOURCE_CASE_ONLY_RENAME_UNSUPPORTED", { value: "OLD" });
var collisions = Object.assign({}, drafts); collisions[String(new File(root, "routes/product/new.txt"))] = "collision";
rejects("SOURCE_ALREADY_EXISTS", {}, { sourceDrafts: collisions });
var hiddenPlan = plan({}, { sourceDrafts: drafts, sourceRemovals: [String(empty)] });
assert(hiddenPlan.sourceRemovals.length === 2, "Already removed source is not resurrected");
var link = new File(source, "linked.txt");
java.nio.file.Files.createSymbolicLink(link.toPath(), saved.toPath());
rejects("SOURCE_LINK_RELOCATION_UNSUPPORTED");
java.nio.file.Files.delete(link.toPath());
var param = new File(root, "routes/[id]");
drafts[String(new File(param, ".marker"))] = "{}";
var paramPlan = plan({ sourcePath: String(param), value: "city", recipe: { prefix: "[", suffix: "]", pattern: "^[A-Za-z_][A-Za-z0-9_]*$" } });
assert(paramPlan.selectionSourcePath.endsWith("/[city]"), "Descriptor naming syntax is retained without knowing its world");
assert(Object.keys(drafts).length === 3 && new File(source, "nested/page.txt").exists(), "Inputs remain unchanged");
files.deleteDirectory(root);
print("source-relocation-plan OK");
