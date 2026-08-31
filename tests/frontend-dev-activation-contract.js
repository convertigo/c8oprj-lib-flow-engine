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

assertTrue(activate.indexOf("frontendActivatePreparedDev(request, blocks, info, entry)") >= 0 &&
	activate.indexOf("frontendStartDevIdleWatcher(request, blocks, info, active)") >= 0,
	"prepared dev activation must receive the block catalog used by the idle watcher");
assertTrue(watcher.indexOf("frontendStartDevActivationWatcher(request, blocks, info, entry)") >= 0 &&
	watcher.indexOf("frontendActivatePreparedDev(request, blocks, info, entry)") >= 0,
	"the asynchronous activation watcher must preserve the block catalog in its closure");
assertTrue(background.indexOf("frontendStartDevActivationWatcher(request, blocks, info, entry)") >= 0,
	"background dev startup must pass the block catalog to asynchronous activation");

print("frontend-dev-activation-contract OK");
