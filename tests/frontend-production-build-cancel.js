// A start of the development mode cancels the production build of its project running in the background: the start
// waited for the whole vite build on the project lock (about a minute on the beta). The processes of the build and their
// children are destroyed, and the production state stays dirty, to build again when the development server stops.
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var File = java.io.File;
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var source = String(FileUtils.readFileToString(new File(engineDir, "Engine.js"), "UTF-8"));

function assert(value, message) { if (!value) throw new Error(message); }
function extract(name) {
	var start = source.indexOf("\n\tfunction " + name + "(") + 2;
	assert(start >= 2, name + " must remain extractable");
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return eval("(" + source.substring(start, end) + ")");
}
function javaStringList(args) {
	var list = new java.util.ArrayList();
	args.forEach(function (arg) { list.add(String(arg)); });
	return list;
}
var logs = [];
function frontendStudioLog(message) { logs.push(String(message)); }
function frontendReadProcessOutput(stream) { return String(Packages.org.apache.commons.io.IOUtils.toString(stream, "UTF-8")); }
var sharedServerJavaMap = extract("sharedServerJavaMap");
var frontendCancellableBuild = new Packages.java.lang.ThreadLocal();
var localProductionBuildCancels = new Packages.java.util.concurrent.ConcurrentHashMap();
var frontendProductionBuildCancels = extract("frontendProductionBuildCancels");
var frontendDestroyProcessTree = extract("frontendDestroyProcessTree");
var frontendCancelProductionBuild = extract("frontendCancelProductionBuild");
var frontendRunProcess = extract("frontendRunProcess");

var key = "OverlayApp|svelte";
var cancel = new Packages.java.util.concurrent.ConcurrentHashMap();
cancel.put("cancelled", new Packages.java.util.concurrent.atomic.AtomicBoolean(false));
cancel.put("processes", new Packages.java.util.concurrent.CopyOnWriteArrayList());
frontendProductionBuildCancels().put(key, cancel);
assert(!frontendCancelProductionBuild("OtherApp|svelte"), "no build of another project is cancelled");

var results = [];
var children = [];
var thread = new java.lang.Thread(function () {
	frontendCancellableBuild.set(cancel);
	try {
		// a build that starts children, as npm starts vite
		results.push(frontendRunProcess(["sh", "-c", "sleep 30 & sleep 30; wait"], new File("."), {}));
		results.push(frontendRunProcess(["sleep", "30"], new File("."), {}));
	} finally {
		frontendCancellableBuild.remove();
	}
});
var startedAt = java.lang.System.currentTimeMillis();
thread.start();
for (var i = 0; i < 100 && cancel.get("processes").isEmpty(); i++) java.lang.Thread.sleep(50);
assert(!cancel.get("processes").isEmpty(), "the build registers its process");
var process = cancel.get("processes").get(0);
java.lang.Thread.sleep(300);
var descendants = process.descendants().iterator();
while (descendants.hasNext()) children.push(descendants.next());
assert(children.length >= 1, "the build has children");
assert(frontendCancelProductionBuild(key), "the start of the development mode cancels the build of its project");
thread.join(10000);
var elapsed = java.lang.System.currentTimeMillis() - startedAt;
assert(!thread.isAlive() && elapsed < 10000, "the build stops at once: " + elapsed + " ms");
assert(results[0].exitCode !== 0, "the running step fails: " + results[0].exitCode);
assert(results[1].exitCode === -1 && /Cancelled/.test(results[1].output), "the next step does not start: " + JSON.stringify(results[1]));
children.forEach(function (child) { assert(!child.isAlive(), "the children are destroyed: " + child.pid()); });
assert(!frontendCancelProductionBuild(key), "a build is cancelled once");
assert(logs.some(function (line) { return /Background build cancelled/.test(line); }), "the cancellation is logged");

var lifecycle = eval(String(FileUtils.readFileToString(new File(engineDir, "modules/frontend-production-lifecycle.js"), "UTF-8")));
var state = lifecycle.cancelled(lifecycle.started({ builtFingerprint: "a", currentFingerprint: "b", dirty: true }, "t1"), "t2");
assert(state.dirty === true && state.status === "dirty" && state.failure === "" && state.builtFingerprint === "a",
	"the production state stays dirty, without failure: " + JSON.stringify(state));
var startDev = source.substring(source.indexOf("\n\tfunction frontendStartDev("), source.indexOf("\n\tfunction ", source.indexOf("\n\tfunction frontendStartDev(") + 1));
assert(startDev.indexOf("frontendCancelProductionBuild(frontendDevKey(request, info))") > 0, "frontendStartDev cancels the build of its project");
print("frontend-production-build-cancel OK");
