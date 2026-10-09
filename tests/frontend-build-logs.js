// The output of the frontbuilder actions of a project is kept for the Build panel of the Studio: the actions log to the
// log of their project (the current log of their thread), the panel reads the lines from the position it reached, the
// oldest lines go beyond the limit, and the read action needs no authoring state.
var engineDir = new java.io.File(arguments[0]).getCanonicalFile();
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));

function assert(value, message) { if (!value) throw new Error(message); }
function extract(name) {
	var start = source.indexOf("\n\tfunction " + name + "(") + 2;
	assert(start >= 2, name + " must remain extractable");
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return eval("(" + source.substring(start, end) + ")");
}
var FRONTEND_LOG_LINES = 5;
var localFrontendLogs = new Packages.java.util.concurrent.ConcurrentHashMap();
var frontendCurrentLog = new Packages.java.lang.ThreadLocal();
var sharedServerJavaMap = extract("sharedServerJavaMap");
var frontendLog = extract("frontendLog");
var frontendLogAppend = extract("frontendLogAppend");
var frontendLogRead = extract("frontendLogRead");
var withFrontendLog = extract("withFrontendLog");
var frontendStudioLog = extract("frontendStudioLog");
var logKey = "App|svelte";
function frontendLogKey() { return logKey; }
var frontendLogsRequest = extract("frontendLogsRequest");

var log = frontendLog("App|svelte");
assert(frontendLog("App|svelte") === log, "one log per project");
frontendStudioLog("outside of an action");
assert(frontendLogRead(log, 0).lines.length === 0, "nothing is kept outside of an action");

withFrontendLog(log, function () {
	frontendStudioLog("[Svelte frontbuilder] > npm run build");
	frontendStudioLog("vite v6\nbuilding for production...");
	frontendStudioLog("a failure", true);
});
var all = frontendLogRead(log, 0);
assert(all.next === 4 && JSON.stringify(all.lines) === JSON.stringify(["[Svelte frontbuilder] > npm run build", "vite v6",
	"building for production...", "warning: a failure"]), "the lines of the action: " + JSON.stringify(all));
assert(frontendCurrentLog.get() == null, "the current log ends with the action");
var since = frontendLogRead(log, 2);
assert(since.next === 4 && since.lines.length === 2 && since.lines[0] === "building for production...", "from a position: " + JSON.stringify(since));
assert(frontendLogRead(log, 4).lines.length === 0, "nothing new");

withFrontendLog(log, function () {
	var thread = new java.lang.Thread(function () {
		frontendStudioLog("another thread, without the log");
	});
	thread.start();
	thread.join();
	frontendStudioLog("line 5\nline 6\nline 7");
});
var capped = frontendLogRead(log, 0);
assert(capped.next === 7 && capped.lines.length === 5 && capped.lines[0] === "building for production..."
	&& capped.skipped === 2, "beyond the limit the oldest lines go: " + JSON.stringify(capped));

var response = frontendLogsRequest({ action: { id: "frontbuilder.svelte.logs", payload: { since: 6 } } });
assert(response.ok && response.next === 7 && JSON.stringify(response.lines) === '["line 7"]', "the read action: " + JSON.stringify(response));
logKey = "";
assert(frontendLogsRequest({ action: { payload: {} } }).lines.length === 0, "no builder, no lines");

var dispatch = source.substring(source.indexOf("\n\tfunction contextActionRequest("), source.indexOf("\n\tfunction contextActionRequest(") + 1500);
assert(dispatch.indexOf('if (id === "frontbuilder.svelte.logs")') > 0 && dispatch.indexOf("withFrontendLog(projectLog") > 0,
	"the frontbuilder actions run with the log of their project, and the logs are read before");
print("frontend-build-logs OK");
