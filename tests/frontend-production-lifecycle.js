var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(engineDir, "modules/frontend-production-lifecycle.js"), "UTF-8"));
var lifecycle = eval(source);

function assertTrue(value, message) {
	if (!value) throw new Error(message);
}

assertTrue(lifecycle.shouldBuildOnStop("manual"), "manual stop must publish production");
assertTrue(lifecycle.shouldBuildOnStop("no-viewer-timeout"), "automatic viewer timeout must publish production");
["first-viewer-timeout", "process-exited", "dependencies-changed", "dev-http-unavailable", "proxy-route-unavailable"]
	.forEach(function (reason) {
		assertTrue(!lifecycle.shouldBuildOnStop(reason), reason + " must not publish production");
	});

var observed = lifecycle.observe(null, "source-a");
assertTrue(observed.dirty && observed.status === "dirty", "a source without a build must be dirty");
var queued = lifecycle.requested(observed, "manual", "2026-08-30T10:00:00.000Z");
assertTrue(queued.status === "queued" && queued.reason === "manual", "build request must be observable");
var building = lifecycle.started(queued, "2026-08-30T10:00:01.000Z");
assertTrue(building.status === "building" && building.dirty, "build must retain dirty state until publication");
var completed = lifecycle.completed(building, "source-a", "2026-08-30T10:00:02.000Z", 987);
assertTrue(!completed.dirty && completed.status === "current", "successful publication must clear dirty state");
assertTrue(completed.builtFingerprint === "source-a" && completed.durationMs === 987,
	"successful publication must retain its fingerprint and duration");
var unchanged = lifecycle.observe(completed, "source-a");
assertTrue(!unchanged.dirty && unchanged.status === "current", "unchanged sources must remain current");
var changed = lifecycle.observe(completed, "source-b");
assertTrue(changed.dirty && changed.status === "dirty", "a new fingerprint must invalidate production");
var failed = lifecycle.failed(changed, "expected failure", "2026-08-30T10:00:03.000Z", 123);
assertTrue(failed.dirty && failed.status === "failed" && failed.builtFingerprint === "source-a",
	"a failed build must preserve the last published fingerprint");

print("frontend-production-lifecycle OK");
