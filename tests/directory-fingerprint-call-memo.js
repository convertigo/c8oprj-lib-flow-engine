// A read-only call (a tree, a palette, a property editor, a menu) computes the fingerprint of a directory once: a
// refresh walks the same catalogs several times, each entry a remote call on a network file system. The calls that
// write always walk, and the memo is per thread and ends with the call.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));

function functionSource(name) {
	var start = source.indexOf("\n\tfunction " + name + "(") + 2;
	if (start < 2) {
		throw new Error("missing function " + name);
	}
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return "(" + source.substring(start, end) + ")";
}

function assertTrue(value, message) {
	if (!value) {
		throw new Error(message);
	}
}

var walks = 0;
function fingerprintUtils() {
	return { directoryFingerprint: function (dir) { walks++; return "fingerprint of " + dir.getName() + " #" + walks; } };
}
function fingerprintEnv() { return {}; }
eval(source.substring(source.indexOf("\tvar MEMOIZED_FINGERPRINT_OPERATIONS"), source.indexOf("\tvar callFingerprints")));
var callFingerprints = new Packages.java.lang.ThreadLocal();
var directoryFingerprint = eval(functionSource("directoryFingerprint"));
function parseRequest(json) { return JSON.parse(json); }
function withActiveRequest(request, callback) { return callback(); }
function response(value) { return value; }
function failure(operation, e) { return { ok: false, error: String(e) }; }
var engineCall = eval(functionSource("engineCall"));

var dir = new java.io.File("/tmp/catalog/ui");
var other = new java.io.File("/tmp/catalog/components");

var seen = engineCall("describeTree", "{}", function () {
	return [directoryFingerprint(dir), directoryFingerprint(dir), directoryFingerprint(other), directoryFingerprint(dir)];
});
assertTrue(walks === 2, "a read-only call walks each directory once: " + walks);
assertTrue(seen[0] === seen[1] && seen[1] === seen[3] && seen[2] !== seen[0], "and gets the same fingerprint: " + seen);

["flowCodeCheck", "analyze"].forEach(function(operation) {
	walks=0;
	engineCall(operation,"{}",function(){directoryFingerprint(dir);directoryFingerprint(dir);});
	assertTrue(walks===1,operation+" reads one catalog version during the call");
});

walks = 0;
engineCall("applySourceMutation", "{}", function () {
	directoryFingerprint(dir);
	directoryFingerprint(dir);
});
assertTrue(walks === 2, "a call that writes walks each time: " + walks);

walks = 0;
directoryFingerprint(dir);
directoryFingerprint(dir);
assertTrue(walks === 2, "outside a call, each time");
assertTrue(callFingerprints.get() == null, "the memo ends with the call");

walks = 0;
engineCall("describeTree", "{}", function () {
	directoryFingerprint(dir);
	var thread = new java.lang.Thread(function () { directoryFingerprint(dir); });
	thread.start();
	thread.join();
	directoryFingerprint(dir);
});
assertTrue(walks === 2, "another thread, as a background build, does not share it: " + walks);

["applySourceMutation", "authoringMutate", "applyMutation", "contextAction", "syncInputs", "run"].forEach(function (operation) {
	assertTrue(MEMOIZED_FINGERPRINT_OPERATIONS[operation] !== true, operation + " always walks");
});

// canonical paths: once per read-only call too, and in a read-only computation reached from another call
var canonicalizations = 0;
function pathFile(path) {
	return {
		getAbsolutePath: function () { return path; },
		getCanonicalPath: function () { canonicalizations++; return path + "/canonical"; }
	};
}
var canonicalPathOf = eval(functionSource("canonicalPathOf"));
var canonicalPath = eval(functionSource("canonicalPath"));
var withReadOnlyMemo = eval(functionSource("withReadOnlyMemo"));
var sourceFile = pathFile("/tmp/project/_flow/page.flow.svelte");
engineCall("describeTree", "{}", function () {
	canonicalPath(sourceFile);
	canonicalPathOf(sourceFile);
	canonicalPath(pathFile("/tmp/project/_flow/other.flow.svelte"));
});
assertTrue(canonicalizations === 2, "a read-only call canonicalizes each path once: " + canonicalizations);
canonicalizations = 0;
canonicalPath(sourceFile);
canonicalPath(sourceFile);
assertTrue(canonicalizations === 2, "outside a call, each time: " + canonicalizations);
canonicalizations = 0;
engineCall("run", "{}", function () {
	canonicalPath(sourceFile);
	withReadOnlyMemo(function () {
		canonicalPath(sourceFile);
		canonicalPath(sourceFile);
	});
	canonicalPath(sourceFile);
});
assertTrue(canonicalizations === 3, "a run memoizes only inside its read-only computations: " + canonicalizations);
assertTrue(callFingerprints.get() == null, "and the memo ends with them");

// traits: loaded once per read-only call (their cache key lists folders and files)
var traitLoads = 0;
function catalogLoaderService() { return { loadTraits: function () { traitLoads++; return { "ui.block": {} }; } }; }
function catalogLoaderEnv() { return {}; }
var loadTraits = eval(functionSource("loadTraits"));
var traitDir = { getAbsolutePath: function () { return "/tmp/project/_flow/traits"; } };
engineCall("authoringPalette", "{}", function () {
	loadTraits([traitDir]);
	loadTraits([traitDir]);
	loadTraits([]);
});
assertTrue(traitLoads === 2, "a read-only call loads the traits of the same folders once: " + traitLoads);
traitLoads = 0;
loadTraits([traitDir]);
loadTraits([traitDir]);
assertTrue(traitLoads === 2, "outside a call, each time: " + traitLoads);

// Module validation is shared only inside a read-only operation. A later call
// must still observe a changed source, and mutations must never reuse the memo.
var moduleChecks = 0, moduleCompiles = 0, moduleVersion = "one";
var runtimeState = { caches: { engineModules: {} } };
function engineModuleFile(name) {
	moduleChecks++;
	return { isFile: function () { return true; },
		getAbsolutePath: function () { return "/engine/modules/" + name; } };
}
function fileFingerprint(file) { return moduleVersion; }
function readRuntimeMapCache(cache, key, fingerprint) {
	var entry = cache[key];
	return entry && entry.fingerprint === fingerprint ? entry.value : null;
}
function writeRuntimeMapCache(cache, key, fingerprint, value) {
	cache[key] = { fingerprint: fingerprint, value: value };
	return value;
}
var FileUtils = { readFileToString: function () { return moduleVersion; } };
function evalCompiledSource(text) { moduleCompiles++; return { version: text }; }
var loadEngineModule = eval(functionSource("loadEngineModule"));
// Use the module file's actual path without involving the path-only test stub.
canonicalPath = function (file) { return file.getAbsolutePath(); };
engineCall("flowCodeCheck", "{}", function () {
	var first = loadEngineModule("schema-utils.js");
	assertTrue(loadEngineModule("schema-utils.js") === first, "same module instance within the call");
});
assertTrue(moduleChecks === 1 && moduleCompiles === 1, "validate and compile once per read-only call");
moduleVersion = "two";
engineCall("flowCodeCheck", "{}", function () {
	assertTrue(loadEngineModule("schema-utils.js").version === "two", "a later call sees a changed module");
});
assertTrue(moduleChecks === 2 && moduleCompiles === 2, "module hot reload is retained");
engineCall("run", "{}", function () {
	loadEngineModule("schema-utils.js");
	loadEngineModule("schema-utils.js");
});
assertTrue(moduleChecks === 4 && moduleCompiles === 2, "writes validate each time and retain the runtime cache");
try { withReadOnlyMemo(function () { loadEngineModule("schema-utils.js"); throw new Error("expected"); }); } catch (expected) {}
assertTrue(callFingerprints.get() == null, "module memo is released on failure too");

// MCP invokes the internal capability during Engine.run, bypassing engineCall.
// It must get the same read-only boundary as the public flowCodeCheck method.
function flowCodeServiceEnv() { return {}; }
function flowCodeService() {
	return { flowCodeCheckRequest: function () {
		directoryFingerprint(dir);
		directoryFingerprint(dir);
		loadEngineModule("schema-utils.js");
		loadEngineModule("schema-utils.js");
		return { ok: true };
	} };
}
var flowCodeCheckRequest = eval(functionSource("flowCodeCheckRequest"));
walks = 0;
var checksBefore = moduleChecks;
assertTrue(flowCodeCheckRequest({}, {}).ok, "direct MCP capability succeeds");
assertTrue(walks === 1 && moduleChecks === checksBefore + 1, "direct MCP capability memoizes directories and modules");
assertTrue(callFingerprints.get() == null, "direct MCP capability releases its memo");

print("directory-fingerprint-call-memo: once per read-only call, per thread; module reload retained");
