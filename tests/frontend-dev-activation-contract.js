var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(engineDir, "Engine.js"), "UTF-8"));

function assertTrue(value, message) {
	if (!value) throw new Error(message);
}

function functionSource(name, nextName) {
	var start = source.indexOf("function " + name + "(");
	var end = source.indexOf("\n\tfunction " + nextName + "(", start);
	assertTrue(start >= 0 && end > start, name + " must remain extractable");
	return source.substring(start, end);
}

var activate = functionSource("frontendActivatePreparedDev", "frontendStartDevActivationWatcher");
var watcher = functionSource("frontendStartDevActivationWatcher", "frontendStartDependencyPreparation");
var background = functionSource("frontendStartDevBackground", "frontendStartDev");
var start = functionSource("frontendStartDev", "frontendDestroyJavaProcess");

assertTrue(activate.indexOf("frontendActivatePreparedDev(request, blocks, info, entry)") >= 0 &&
	activate.indexOf("frontendStartDevIdleWatcher(request, blocks, info, active)") >= 0,
	"prepared dev activation must receive the block catalog used by the idle watcher");
assertTrue(watcher.indexOf("frontendStartDevActivationWatcher(request, blocks, info, entry)") >= 0 &&
	watcher.indexOf("frontendActivatePreparedDev(request, blocks, info, entry)") >= 0,
	"the asynchronous activation watcher must preserve the block catalog in its closure");
assertTrue(background.indexOf("frontendStartDevActivationWatcher(request, blocks, info, entry)") >= 0,
	"background dev startup must pass the block catalog to asynchronous activation");
assertTrue(start.indexOf('frontendRunAction(request, blocks, "build")') < 0,
	"dev startup must not run a blocking production catch-up before Vite");
assertTrue(activate.indexOf('frontendScheduleProductionBuild(request, blocks, "startup-catch-up")') < 0 &&
	activate.indexOf('cause: "dev-active"') > activate.indexOf("frontendNotifyStudioBrowser(request, browser)"),
	"asynchronous activation must leave dirty production deferred while Vite is active");

var startNow = functionSource("frontendStartDevNow", "frontendActivatePreparedDev");
assertTrue(startNow.indexOf('frontendScheduleProductionBuild(request, blocks, "startup-catch-up")') < 0 &&
	startNow.indexOf('cause: "dev-active"') > startNow.indexOf("frontendNotifyStudioBrowser(request, browser)"),
	"synchronous startup must leave dirty production deferred while Vite is active");

var logPump = functionSource("frontendStartLogPump", "frontendFinalizeDevState");
assertTrue(logPump.indexOf("/(?:stream|pipe) closed/i") >= 0 &&
	logPump.indexOf("!process.isAlive()") >= 0 &&
	logPump.indexOf("frontendStudioLog") >= 0,
	"expected process stream closure must not be logged as a dev failure");

var runAction = functionSource("frontendRunAction", "frontendActionSteps");
assertTrue(runAction.indexOf("request.productionBuildFingerprint") >= 0 &&
	runAction.indexOf("currentProductionFingerprint") >= 0,
	"a background production build must retain the fingerprint it actually started from");
assertTrue(runAction.indexOf('action === "build"') >= 0 &&
	runAction.indexOf("FRONTBUILDER_BUILD_BLOCKED_DEV_ACTIVE") >= 0,
	"an explicit production build must be rejected while a dev process is active");

var schedule = functionSource("frontendScheduleProductionBuild", "frontendStopDev");
assertTrue(schedule.indexOf("stableRequest.productionBuildFingerprint = activeState.currentFingerprint") <
	schedule.indexOf('frontendRunAction(stableRequest, blocks, "build")'),
	"the asynchronous builder must capture its source fingerprint before generation starts");

var contextMenu = functionSource("contextMenuRequest", "contextMenuItem");
assertTrue(contextMenu.indexOf('"frontbuilder.svelte.build", "Build prod"') >= 0 &&
	contextMenu.indexOf('rebuilt automatically after Dev stops') >= 0 &&
	contextMenu.indexOf('"", !dev)') >= 0,
	"the Studio menu must disable production build while Dev is active");

print("frontend-dev-activation-contract OK");
