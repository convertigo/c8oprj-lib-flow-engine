// The fingerprint of the source working copies of the active request is read for each native block call (catalog key):
// a request without working copies gives the empty fingerprint without building a source view; any other request gives
// the fingerprint of its view, and an invalid one is still refused by the view.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var source = String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
function assert(value, message) { if (!value) throw new Error(message); }
function extract(name) {
	var start = source.indexOf("\n\tfunction " + name + "(") + 2;
	assert(start >= 2, name + " must remain extractable");
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return source.substring(start, end);
}
var module = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "modules/source-working-copies.js"), "UTF-8")));
var env = { File: java.io.File, FileUtils: FileUtils, hash: function (text) { return "h" + text.length; } };
var active = null, views = 0;
function currentActiveRequest() { return active; }
function sourceView(request) { views++; return module.create(request, env); }
var hasNoSourceWorkingCopies = eval("(" + extract("hasNoSourceWorkingCopies") + ")");
var sourceDraftsFingerprint = eval("(" + extract("sourceDraftsFingerprint") + ")");
function reference(request) { return module.create(request, env).fingerprint(); }
function outcome(callback) { try { return "ok:" + callback(); } catch (error) { return "error:" + String(error.message || error); } }

var empty = [null, {}, { sourceDrafts: {} }, { frontendSourceDrafts: {} }, { drafts: {} }, { sourceRemovals: [] },
	{ sourceDrafts: Object.create(null), sourceRemovals: [] }, { sourceDrafts: null, sourceRemovals: null }];
empty.forEach(function (request) {
	active = request; views = 0;
	assert(sourceDraftsFingerprint() === "" && views === 0, "no view for " + JSON.stringify(request));
	assert(reference(request) === "", "the view agrees for " + JSON.stringify(request));
});
var file = String(new java.io.File(java.lang.System.getProperty("java.io.tmpdir"), "flow-drafts-fingerprint/a.js").getCanonicalPath());
var drafts = {};
drafts[file] = "text";
var others = [{ sourceDrafts: drafts }, { frontendSourceDrafts: drafts }, { sourceRemovals: [file] },
	{ sourceDrafts: "not an object" }, { sourceDrafts: ["array"] }, { sourceRemovals: "not a list" }, { sourceDrafts: { "": 1 } }];
others.forEach(function (request) {
	active = request; views = 0;
	var expected = outcome(function () { return reference(request); });
	assert(outcome(sourceDraftsFingerprint) === expected && views === 1, "the view decides for " + JSON.stringify(request) + ": " + expected);
});
assert(outcome(function () { active = { sourceDrafts: drafts }; return sourceDraftsFingerprint(); }) === "ok:" + file + ":h4",
	"a draft keeps its fingerprint");
print("source-drafts-fingerprint OK");
