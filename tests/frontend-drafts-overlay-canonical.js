// With a local working directory (#1221), the _private folder of a project is a link to the working directory.
// A generation from drafts runs on an overlay below _private: its model file is canonical, so its root must be
// too, or the frontbuilder does not map the overlay sources back to the project sources and the frontend viewer
// selects nothing in the tree.
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var File = java.io.File;
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var Files = java.nio.file.Files;
var source = String(FileUtils.readFileToString(new File(engineDir, "Engine.js"), "UTF-8"));
var temp = Files.createTempDirectory("flow-drafts-overlay-").toFile();

function assert(value, message) { if (!value) throw new Error(message); }
function extract(name) {
	var start = source.indexOf("\n\tfunction " + name + "(") + 2;
	assert(start >= 2, name + " must remain extractable");
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return eval("(" + source.substring(start, end) + ")");
}
var copies = eval(String(FileUtils.readFileToString(new File(engineDir, "modules/source-working-copies.js"), "UTF-8")));
function sourceView(request) {
	return copies.create(request, { File: File, FileUtils: FileUtils, hash: function (text) { return text; } });
}
function canonicalPath(file) { return String(file.getCanonicalPath()); }
function sha256Hex(text) {
	var digest = java.security.MessageDigest.getInstance("SHA-256").digest(new java.lang.String(text).getBytes("UTF-8"));
	var hex = "";
	for (var i = 0; i < digest.length; i++) hex += ((digest[i] & 0xff) + 256).toString(16).substring(1);
	return hex;
}
function frontendPrivateRootFile() {}
function frontendProjectName() { return "OverlayApp"; }
var frontendDraftForFile = extract("frontendDraftForFile");
var frontendDraftEntriesUnder = extract("frontendDraftEntriesUnder");
var frontendWriteFile = extract("frontendWriteFile");
var fileForProjectPath = extract("fileForProjectPath");
var frontendRelativePath = extract("frontendRelativePath");
var frontendFlowSvelteSourceRoot = extract("frontendFlowSvelteSourceRoot");
var frontendCopyFlowSvelteOverlay = extract("frontendCopyFlowSvelteOverlay");
var frontendWriteExtraDraftEntries = extract("frontendWriteExtraDraftEntries");
var frontendEffectiveModelPath = extract("frontendEffectiveModelPath");

try {
	var project = new File(temp, "workspace/projects/OverlayApp");
	var work = new File(temp, "work/projects/OverlayApp/_private");
	work.mkdirs();
	project.mkdirs();
	Files.createSymbolicLink(new File(project, "_private").toPath(), work.toPath());
	var model = new File(project, "_flow/frontbuilder/svelte/model/OverlayApp/src/routes/+page.flow.svelte");
	FileUtils.writeStringToFile(model, "saved page", "UTF-8");
	var drafts = {};
	drafts[String(model.getCanonicalPath())] = "draft page";

	var effective = frontendEffectiveModelPath({ projectDir: String(project.getAbsolutePath()), sourceDrafts: drafts },
		{ settings: {} }, model);
	var root = String(effective.effectiveSourceRoot.getAbsolutePath());
	var file = String(effective.file.getAbsolutePath());
	assert(file.indexOf(root + File.separator) === 0, "the overlay model is below the overlay root:\n" + file + "\n" + root);
	assert(root.indexOf(String(work.getCanonicalPath())) === 0, "both in the working directory: " + root);
	assert(String(FileUtils.readFileToString(effective.file, "UTF-8")) === "draft page", "the overlay holds the draft");
	assert(String(effective.sourceIdentityRoot.getCanonicalPath()) === String(model.getParentFile().getParentFile().getParentFile().getCanonicalPath()),
		"the identity root is the project source root: " + effective.sourceIdentityRoot);
	print("frontend-drafts-overlay-canonical OK");
} finally {
	FileUtils.deleteQuietly(temp);
}
