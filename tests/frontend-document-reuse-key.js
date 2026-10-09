// The reuse key of a described document stays the same when the page is saved (its draft becomes its file, with a new
// date and the same content): the next mutation reuses the document the companion described. Another page, a draft of
// another source or another content change the key.
var engineFolder = new java.io.File(arguments[0]).getCanonicalFile();
var File = java.io.File;
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var Arrays = java.util.Arrays;
var source = String(FileUtils.readFileToString(new File(engineFolder, "Engine.js"), "UTF-8"));
var temp = java.nio.file.Files.createTempDirectory("flow-document-reuse-").toFile();

function assert(value, message) { if (!value) throw new Error(message); }
function extract(name) {
	var start = source.indexOf("\n\tfunction " + name + "(") + 2;
	assert(start >= 2, name + " must remain extractable");
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return eval("(" + source.substring(start, end) + ")");
}
function canonicalPath(file) { return String(file.getCanonicalPath()); }
function sha256Hex(text) { return String(text); }
function fileFingerprint() { return "codec"; }
function engineModuleFile(name) { return new File(temp, name); }
function engineDir() { return new File(temp, "engine"); }
function frontendReferenceRoots() { return []; }
function frontendSvelteToolRoot(root) { return root; }
function sourcePaths() { return { path: function (relative) { return "_flow/" + relative; } }; }
var runtimeState = { frontendDependencyFingerprints: {} };
var frontendFingerprintFiles = extract("frontendFingerprintFiles");
var frontendDocumentDependencies = extract("frontendDocumentDependencies");
var frontendDocumentReuseKey = extract("frontendDocumentReuseKey");

try {
	var project = new File(temp, "App");
	var routes = new File(project, "_flow/frontbuilder/svelte/model/App/src/routes");
	var page = new File(routes, "+page.flow.svelte");
	var layout = new File(routes, "+layout.flow.svelte");
	var other = new File(routes, "shop/+page.flow.svelte");
	FileUtils.writeStringToFile(page, "saved", "UTF-8");
	FileUtils.writeStringToFile(layout, "layout", "UTF-8");
	FileUtils.writeStringToFile(other, "shop", "UTF-8");
	var resourceRoot = new File(temp, "frontbuilder");
	resourceRoot.mkdirs();
	function key(content, drafts, request) {
		return frontendDocumentReuseKey(content, drafts || {}, page, resourceRoot, project, request || {});
	}

	var asDraft = {};
	asDraft[canonicalPath(page)] = "edited";
	var described = key("edited", asDraft);
	page.setLastModified(page.lastModified() - 5000);
	FileUtils.writeStringToFile(page, "edited", "UTF-8");
	page.setLastModified(page.lastModified() + 10000);
	assert(key("edited", {}) === described, "a saved page keeps the key of its described draft");
	assert(key("edited again", {}) !== described, "another content changes it");

	var otherDraft = {};
	otherDraft[canonicalPath(other)] = "shop draft";
	assert(key("edited", otherDraft) !== described, "a draft of another page changes it");
	var removed = key("edited", {}, { sourceRemovals: [canonicalPath(other)] });
	assert(removed !== described, "a removed page changes it");
	assert(key("edited", {}, { sourceRemovals: [canonicalPath(page)] }) === described, "the page itself is left out");

	other.setLastModified(other.lastModified() - 5000);
	FileUtils.writeStringToFile(other, "shop changed", "UTF-8");
	assert(key("edited", {}) !== described, "another page changed on disk changes it");
	print("frontend-document-reuse-key OK");
} finally {
	FileUtils.deleteQuietly(temp);
}
