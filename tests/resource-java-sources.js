// The Java sources of a project (libs/src/**/*.java) are resources of the project: listed, read, searched, patched and
// deleted like the other ones, and created by a patch from an empty file. A source declares the package of its folder;
// other files of libs/src and other new resources stay refused.
var sourceRoot = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var File = java.io.File;
var temp = java.nio.file.Files.createTempDirectory("flow-java-sources-").toFile();
function assert(value, message) { if (!value) throw new Error(message); }
function read(file) { return String(FileUtils.readFileToString(file, "UTF-8")); }
function write(file, text) { FileUtils.writeStringToFile(file, String(text), "UTF-8"); }
function module(name) { return eval(read(new File(sourceRoot, "modules/" + name))); }
function raise(code, message) { var error = new Error(code + ": " + message); error.code = code; throw error; }
function refused(code, fn) {
	try { fn(); } catch (e) { return e.code === code || String(e.message).indexOf(code) === 0; }
	return false;
}

var paths = module("source-layout.js").create("_flow");
var utils = module("resource-utils.js");
var patches = module("patch-utils.js");
var service = module("resource-service.js");
var project = new File(temp, "App");
var env = {
	sourcePaths: paths,
	File: File,
	Arrays: java.util.Arrays,
	FileUtils: FileUtils,
	raise: raise,
	projectDir: function () { return project; },
	canonicalPath: function (file) { return String(file.getCanonicalPath()); },
	normalizeResourcePath: function (path) { return utils.normalizePath(path, { raise: raise }); },
	isAllowedResourcePath: function (path) { return utils.isAllowedPath(path, paths); },
	resourceKind: function (path) { return utils.kind(path, paths); },
	resourceName: utils.name,
	resourceMimeType: utils.mimeType,
	resourceUri: function (path) { return utils.uri(path, paths); },
	firstMarkdownHeading: utils.firstMarkdownHeading,
	firstMarkdownParagraph: utils.firstMarkdownParagraph,
	globPatterns: utils.globPatterns,
	globMatches: utils.globMatches,
	intOption: function (value, fallback) { return value === undefined ? fallback : value; },
	sha256Hex: function (text) { return String(Packages.org.apache.commons.codec.digest.DigestUtils.sha256Hex(String(text))); },
	applyUnifiedPatchText: function (content, patch) { return patches.applyUnifiedPatchText(content, patch, { raise: raise }); },
	blockIdFromResourcePath: function (path) { return utils.blockIdFromPath(path, paths); }
};

try {
	["libs/src/com/acme/Rows.java", "libs/src/Root.java"].forEach(function (path) {
		assert(utils.isAllowedPath(path, paths) && utils.kind(path, paths) === "javaSource", "Java source allowed: " + path);
	});
	["libs/src/com/acme/rows.properties", "libs/build/classes/com/acme/Rows.class", "libs/Rows.java", "libs/driver.jar"].forEach(function (path) {
		assert(!utils.isAllowedPath(path, paths), "only the Java sources of libs/src: " + path);
	});
	assert(utils.name("libs/src/com/acme/Rows.java") === "Rows" && utils.mimeType("Rows.java") === "text/x-java-source", "name and type");

	var inserted = patches.applyUnifiedPatchText("a\nc\n", "@@ -1,0 +2 @@\n+b\n", { raise: raise });
	assert(inserted.content === "a\nb\nc\n", "a hunk without old lines inserts after its line: " + JSON.stringify(inserted));
	assert(patches.applyUnifiedPatchText("", "@@ -0,0 +1 @@\n+x\n\\ No newline at end of file\n", { raise: raise }).content === "x",
		"a created file ends with a new line unless the patch says otherwise");

	var created = service.patch({
		path: "libs/src/com/acme/Rows.java",
		patch: "--- /dev/null\n+++ b/libs/src/com/acme/Rows.java\n@@ -0,0 +1,3 @@\n+package com.acme;\n+\n+public class Rows {}\n"
	}, env);
	var file = new File(project, "libs/src/com/acme/Rows.java");
	assert(created.ok && created.created === true && created.validation.kind === "javaSource" && file.isFile(), "created: " + JSON.stringify(created));
	assert(read(file) === "package com.acme;\n\npublic class Rows {}\n", "content of the created source: " + read(file));

	var listed = service.list({ pattern: "libs/src/**/*.java" }, env);
	var entry = (listed.resources || []).filter(function (r) { return r.path === "libs/src/com/acme/Rows.java"; })[0];
	assert(entry && entry.kind === "javaSource", "listed: " + JSON.stringify(listed));
	var got = service.get({ path: "libs/src/com/acme/Rows.java" }, env);
	assert(got.content === read(file), "read: " + JSON.stringify(got));
	assert(service.projectResourceEntries(env).some(function (e) { return e.path === "libs/src/com/acme/Rows.java"; }), "searched with the other resources");

	var edited = service.patch({
		path: "libs/src/com/acme/Rows.java",
		baseHash: created.newHash,
		patch: "--- a/libs/src/com/acme/Rows.java\n+++ b/libs/src/com/acme/Rows.java\n@@ -3 +3 @@\n-public class Rows {}\n+public class Rows { public static int size() { return 0; } }\n"
	}, env);
	assert(edited.created === false && read(file).indexOf("size()") > 0, "edited: " + JSON.stringify(edited));

	assert(refused("INVALID_JAVA_SOURCE", function () {
		service.patch({ path: "libs/src/com/acme/Rows.java", patch: "--- a/x\n+++ b/x\n@@ -1 +1 @@\n-package com.acme;\n+package com.other;\n" }, env);
	}), "a source declares the package of its folder");
	assert(refused("INVALID_JAVA_SOURCE", function () {
		service.patch({ path: "libs/src/Root.java", patch: "--- /dev/null\n+++ b/x\n@@ -0,0 +1 @@\n+package com.acme; class Root {}\n" }, env);
	}), "the root of libs/src is the default package");
	var root = service.patch({ path: "libs/src/Root.java", patch: "--- /dev/null\n+++ b/x\n@@ -0,0 +1,2 @@\n+/* package com.acme; */\n+class Root {}\n" }, env);
	assert(root.created && new File(project, "libs/src/Root.java").isFile(), "a commented package is no declaration");
	assert(refused("RESOURCE_PATH_NOT_ALLOWED", function () {
		service.patch({ path: "libs/src/com/acme/rows.properties", patch: "--- /dev/null\n+++ b/x\n@@ -0,0 +1 @@\n+a=b\n" }, env);
	}), "other files of libs/src are refused");
	assert(refused("UNKNOWN_RESOURCE", function () {
		service.patch({ path: "_flow/lib/missing.js", patch: "--- /dev/null\n+++ b/x\n@@ -0,0 +1 @@\n+({})\n" }, env);
	}), "other resources are not created by a patch");

	var removed = service.remove({ path: "libs/src/com/acme/Rows.java" }, env);
	assert(removed.deleted && !file.exists(), "deleted: " + JSON.stringify(removed));
	print("resource-java-sources OK");
} finally {
	FileUtils.deleteQuietly(temp);
}
