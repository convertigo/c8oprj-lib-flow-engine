// A Flow a job of the server scheduler runs is started by the server, without a caller. In the PCA of 11/11 the daily
// processing was scheduled while private, then declared hidden to be started from a page: an anonymous call started it,
// with its mails and its writes. scheduler-apply only schedules a private Flow; the check of its source now keeps it
// private: a scheduled Flow declared hidden or public is refused, in code-check as in code-set.
var engineDir = new java.io.File(arguments.length ? arguments[0] : "_flow").getCanonicalFile();
var __flowEngineDir = String(engineDir.getAbsolutePath());
var project = java.nio.file.Files.createTempDirectory("flow-scheduled-private-").toFile();
var __flowProjectDir = String(project.getAbsolutePath());
// The tests of the engine have no server scheduler: this map stands for it (Project.Flow -> job names).
var __flowScheduledJobs = {};
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(value, message) { checks++; if (!value) throw new Error(message); }
function write(file, text) { FileUtils.writeStringToFile(file, String(text), "UTF-8"); }
try {
	write(new java.io.File(project, "c8oProject.yaml"), "↓Tracker [core.Project]: \n");
	var engine = eval(String(FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8")));
	function api(method, request) { return JSON.parse(engine[method](JSON.stringify(request))); }
	function code(accessibility) {
		var meta = { sourceVersion: 2, inputs: { day: { type: "string", "default": "" } } };
		if (accessibility) meta.accessibility = accessibility;
		return "const _flow = " + JSON.stringify(meta) + "\nfunction DailyJob({input, result}) {\nresult.day = input.day\nreturn result\n}";
	}
	function scheduled(out) {
		// a check that fails answers its diagnostics under error
		return (out.diagnostics || (out.error && out.error.diagnostics) || []).filter(function (d) { return d.code === "FLOW_SCHEDULED_NOT_PRIVATE"; })[0];
	}
	write(new java.io.File(project, "_flow/flows/DailyJob.flow.js"), code("private"));

	// Not scheduled: hidden is the author's choice.
	var free = api("flowCodeCheck", { name: "DailyJob", code: code("hidden") });
	assert(free.ok && !scheduled(free), "a hidden Flow no job runs is accepted: " + JSON.stringify(free.diagnostics));

	// Scheduled: the same check is refused, the cached answer of before is not reused.
	__flowScheduledJobs["Tracker.DailyJob"] = ["Tracker.daily_reminder"];
	var hidden = api("flowCodeCheck", { name: "DailyJob", code: code("hidden") });
	var diagnostic = scheduled(hidden);
	assert(!hidden.ok && diagnostic && diagnostic.severity === "error", "a scheduled hidden Flow is refused: " + JSON.stringify(hidden));
	assert(/Tracker\.daily_reminder/.test(diagnostic.message), "the job is named: " + diagnostic.message);
	assert(/private/.test(String(diagnostic.hint)) && /ADMIN/.test(String(diagnostic.hint)) && /requestable\.call/.test(String(diagnostic.hint)),
		"the hint gives the hidden Flow that checks ADMIN and calls the job: " + diagnostic.hint);
	assert(diagnostic.property === "accessibility" && diagnostic.expected === "private", "the property is named: " + JSON.stringify(diagnostic));
	assert(scheduled(api("flowCodeCheck", { name: "DailyJob", code: code("public") })), "public is refused too");

	// code-set says it (the working copy is kept for the repair), code-promote refuses it: the saved Flow stays private.
	var saved = api("flowCodeGet", { name: "DailyJob", draft: false });
	var set = api("flowCodeSet", { name: "DailyJob", code: code("hidden"), revision: saved.revision });
	assert(!set.ok && scheduled(set), "code-set says it: " + JSON.stringify(set));
	var promoted = api("flowCodePromote", { name: "DailyJob" });
	assert(!promoted.ok, "code-promote refuses it: " + JSON.stringify(promoted));
	var official = String(api("flowCodeGet", { name: "DailyJob", draft: false }).code);
	assert(official.indexOf("\"private\"") !== -1 && official.indexOf("hidden") === -1, "the saved Flow stays private: " + official);
	var direct = api("flowCodePromote", { name: "DailyJob", code: code("public") });
	assert(!direct.ok && String(api("flowCodeGet", { name: "DailyJob", draft: false }).code).indexOf("public") === -1, "promoting code directly is refused too");

	// Private, or without a declaration (the accessibility property of the Flow, which scheduler-apply checked): accepted.
	assert(!scheduled(api("flowCodeCheck", { name: "DailyJob", code: code("private") })), "a scheduled private Flow is accepted");
	assert(!scheduled(api("flowCodeCheck", { name: "DailyJob", code: code("") })), "without a declaration, nothing is said");
	print("flow-scheduled-private OK (" + checks + " checks)");
} finally {
	FileUtils.deleteQuietly(project);
}
