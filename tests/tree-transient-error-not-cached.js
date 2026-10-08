// A tree showing a frontend model that could not be described ("Invalid model") is not cached: the failure may come
// from the toolchain (the packages of the builder being installed again after a restart), which the fingerprint of
// the sources does not see, so a cached tree kept the error until the sources changed.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));

function functionSource(name) {
	var start = source.indexOf("\n\tfunction " + name + "(") + 2;
	if (start < 2) {
		throw new Error("missing function " + name);
	}
	// up to its closing brace: comments and variables of the next function follow
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return "(" + source.substring(start, end) + ")";
}

function assertTrue(value, message) {
	if (!value) {
		throw new Error(message);
	}
}

var treeHasTransientError = eval(functionSource("treeHasTransientError"));

function node(name, kind, type, children) {
	return { name: name, kind: kind, type: type, children: children || [] };
}

function treeWith(model) {
	return node("root", "root", "engine", [node("frontends", "folder", "frontends", [node("svelte", "frontendBuilder", "svelte", [model])])]);
}

var invalid = treeWith(node("modelError", "error", "frontendModel"));
var missing = treeWith(node("missingModel", "error", "frontendModel"));
var valid = treeWith(node("model", "frontendModel", "frontendModel"));

assertTrue(treeHasTransientError(invalid), "an invalid model deep in the tree is seen");
assertTrue(!treeHasTransientError(missing), "a missing model file is not transient: the fingerprint sees it");
assertTrue(!treeHasTransientError(valid), "a described model is not an error");
assertTrue(!treeHasTransientError(null), "no tree");

// describeTreeRequest, with its collaborators stubbed
var described = 0;
var sharedWrites = 0;
var runtime = {};
var next = invalid;
var runtimeState = { caches: { treeSnapshots: runtime } };
function describeTreeCacheKey() { return "key"; }
function describeTreeFingerprint() { return "fingerprint"; }
function readRuntimeMapCache(cache, key, fingerprint) { return cache[key] && cache[key].fingerprint === fingerprint ? cache[key].value : null; }
function writeRuntimeMapCache(cache, key, fingerprint, value) { cache[key] = { fingerprint: fingerprint, value: value }; return value; }
function pruneDescribeTreeCacheFamily() {}
var shared = {};
function readSharedEngineTree(key, fingerprint) { return shared[key + fingerprint] || null; }
function writeSharedEngineTree(key, fingerprint, tree) { sharedWrites++; shared[key + fingerprint] = tree; }
function flowTreeService() { return { describeTreeRequest: function () { described++; return next; } }; }
function flowTreeServiceEnv() { return {}; }
function seedAuthoringTreeCandidate() {}
function normalizeTree(tree) { return tree; }
var describeTreeRequest = eval(functionSource("describeTreeRequest"));

var request = { target: "engine", projectDir: "/workspace/projects/sample" };
assertTrue(describeTreeRequest(request, {}) === invalid, "the tree with the invalid model is returned");
assertTrue(describeTreeRequest(request, {}) === invalid && described === 2, "and described again, not cached");
assertTrue(sharedWrites === 0 && !runtime.key, "neither in the runtime cache nor in the shared map");

next = valid;
assertTrue(describeTreeRequest(request, {}) === valid && described === 3, "once the model is described, the tree is");
assertTrue(describeTreeRequest(request, {}) === valid && described === 3, "cached again");
assertTrue(sharedWrites === 1, "and shared");

print("tree-transient-error-not-cached: invalid models are described again, valid trees cached");
