var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "libs/flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(
	new java.io.File(engineDir, "Engine.js"), "UTF-8"));

function assertTrue(value, message) {
	if (!value) {
		throw new Error(message);
	}
}

function extract(name, nextName) {
	var start = source.indexOf("function " + name + "(");
	var end = source.indexOf("\n\tfunction " + nextName + "(", start);
	assertTrue(start >= 0 && end > start, name + " must remain extractable");
	return eval("(" + source.substring(start, end).trim() + ")");
}

function frontendProjectName(request) {
	return String(request && request.project || "");
}

function frontendWaitForPort(host, port) {
	return host === "127.0.0.1" && port === 40811;
}

var frontendStudioBrowser = extract("frontendStudioBrowser", "frontendBrowserControlState");
var frontendBrowserControlState = extract("frontendBrowserControlState", "frontendNotifyStudioBrowser");
var browser = frontendStudioBrowser({ project: "Clock", browserDebugPort: 40811 },
	"http://localhost/app", "Svelte dev mode", "frontbuilder.svelte.dev");
var control = frontendBrowserControlState({ browserDebugPort: 40811 }, browser, 1);

assertTrue(browser.debugPort === 40811 && browser.debugUrl === "http://127.0.0.1:40811",
	"Flow Studio browser should carry the managed CDP port");
assertTrue(control.browserDebugPortMatched === true && control.browserControlReady === true,
	"Flow browser control should become ready only after the managed CDP port accepts connections");

print("frontend-managed-browser-control OK");
