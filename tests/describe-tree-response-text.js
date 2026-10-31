// The Studio asks the whole engine tree again after each change of a project, on its UI thread. The tree of a large
// frontend is megabytes: normalizing, sanitizing and serializing it again on each ask cost more than describing it
// from the caches, and a tree described for the shared map was serialized twice. The describeTree method now answers
// the text kept with the snapshot, serialized once and shared as is; the other callers still get a copy of the tree.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var checks = 0;

function functionSource(name) {
	var start = source.indexOf("\n\tfunction " + name + "(") + 2;
	if (start < 2) {
		throw new Error("missing function " + name);
	}
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return "(" + source.substring(start, end) + ")";
}

function assertTrue(value, message) {
	checks++;
	if (!value) {
		throw new Error(message);
	}
}

// describeTreeRequest, with its collaborators stubbed
var DescribedTreeText = eval(functionSource("DescribedTreeText"));
var describedTreeText = eval(functionSource("describedTreeText"));
var serializations = 0, described = 0, seeded = 0;
var sharedTexts = [];
var runtime = {};
var fingerprintValue = "v1";
var runtimeState = { caches: { treeSnapshots: runtime } };
function describeTreeCacheKey() { return "key"; }
function describeTreeFingerprint() { return fingerprintValue; }
function readRuntimeMapCache(cache, key, fingerprint) { return cache[key] && cache[key].fingerprint === fingerprint ? cache[key].value : null; }
function writeRuntimeMapCache(cache, key, fingerprint, value) { cache[key] = { fingerprint: fingerprint, value: value }; return value; }
function pruneDescribeTreeCacheFamily() {}
function readSharedEngineTree() { return null; }
function writeSharedEngineTree(key, fingerprint, tree, text) { sharedTexts.push(text()); }
function acquireSharedEngineTreeFlight() { return null; }
function releaseSharedEngineTreeFlight() {}
function treeHasTransientError() { return false; }
function flowTreeService() {
	return { describeTreeRequest: function () { described++; return { ok: true, target: "engine", children: [{ name: "page", info: "{\"a\":1}", children: [] }] }; } };
}
function flowTreeServiceEnv() { return {}; }
function seedAuthoringTreeCandidate(request, tree) { seeded++; tree.__flowAuthoringSnapshotFingerprints = { svelte: fingerprintValue }; }
function normalizeTree(tree) { return JSON.parse(JSON.stringify(tree)); }
function sanitizeRuntimeValue(value) { serializations++; return value; }
var describeTreeRequest = eval(functionSource("describeTreeRequest"));

var request = { target: "engine", projectDir: "/workspace/projects/sample" };
var first = describeTreeRequest(request, {}, true);
assertTrue(first instanceof DescribedTreeText && described === 1 && serializations === 1, "described and serialized once");
assertTrue(JSON.parse(first.text).__flowAuthoringSnapshotFingerprints.svelte === "v1", "the text is the seeded tree");
assertTrue(sharedTexts.length === 1 && sharedTexts[0] === first.text, "the shared map gets the same text, not a second serialization");
var second = describeTreeRequest(request, {}, true);
assertTrue(second.text === first.text && described === 1 && serializations === 1, "asked again unchanged: the kept text, nothing copied");
var copy = describeTreeRequest(request, {});
assertTrue(!(copy instanceof DescribedTreeText) && copy.children[0].name === "page", "an internal caller still gets a tree");
copy.children[0].name = "changed";
assertTrue(describeTreeRequest(request, {}, true).text === first.text, "changing that copy changes neither the snapshot nor its text");
assertTrue(Object.keys(runtime.key.value).indexOf("__flowResponseJson") === -1, "the text is not a key of the tree");
fingerprintValue = "v2";
var changed = describeTreeRequest(request, {}, true);
assertTrue(described === 2 && changed.text !== first.text && JSON.parse(changed.text).__flowAuthoringSnapshotFingerprints.svelte === "v2",
	"a change of the sources gives a new text");

// the engine: the method answers the same JSON, again unchanged and after a change of the source
var engine = eval(source);
function describe(engineSource) {
	return String(engine.describeTree(JSON.stringify({ target: "engine", engineSource: engineSource, includeFlowCatalog: false })));
}
var engineSource = "version: 1\nconfig:\n  sample:\n    value: one\n";
var text = describe(engineSource);
var tree = JSON.parse(text);
assertTrue(tree.ok === true && text.indexOf("__flowResponseJson") === -1, "the method answers the tree: " + text.substring(0, 200));
assertTrue(describe(engineSource) === text, "asked again, the same text");
var edited = describe(engineSource.replace("one", "two"));
assertTrue(edited !== text && edited.indexOf("two") !== -1, "a changed source is described again");
var failed = JSON.parse(String(engine.describeTree("{not json")));
assertTrue(failed.ok === false, "a failure still answers its error");

print("describe-tree-response-text: " + checks + " checks");
