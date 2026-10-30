// The acceptance plan of a production build (build, openBuilt) navigated to the build and closed the browser: in the
// Studio, whose viewer is one page an agent must never navigate, open or close (and openBuilt shows the build in a
// Studio browser Playwright does not drive), the agent of a trial replaced it by HTTP checks of its own. In the Studio,
// the plan now checks the build over HTTP from the current viewer page (the page and the scripts and styles it loads),
// without browser_navigate, browser_resize or browser_close; elsewhere it is unchanged.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var projectDirFile = java.nio.file.Files.createTempDirectory("lib-flow-engine-build-acceptance-").toFile();
var __flowEngineDir = engineDir;
var __flowProjectDir = String(projectDirFile.getAbsolutePath());
var files = Packages.org.apache.commons.io.FileUtils;
var checks = 0;
function assert(condition, message) { checks++; if (!condition) throw new Error(message); }
// Packages with Engine.isStudioMode() answering true, all else unchanged
function overlay(real, path, leaf) {
	return new Proxy({}, { get: function (target, key) {
		if (String(key) !== path[0]) return real[key];
		return path.length === 1 ? leaf(real[key]) : overlay(real[key], path.slice(1), leaf);
	} });
}
var studioPackages = overlay(Packages, ["com", "twinsoft", "convertigo", "engine", "Engine"], function (engineClass) {
	return new Proxy({}, { get: function (target, key) {
		return String(key) === "isStudioMode" ? function () { return true; } : engineClass[key];
	} });
});
try {
	var server = eval(source);
	var studio = (function (Packages) { return eval(source); })(studioPackages);
	var modelDir = new java.io.File(projectDirFile, "_flow/frontbuilder/svelte/model/Orders/src/routes");
	modelDir.mkdirs();
	files.writeStringToFile(new java.io.File(modelDir, "+page.flow.svelte"),
		'<script module>export const _flow = { sourceVersion: 2 };</script>\n<FlowComponent $$id="orders"><Structure><Text $$id="t" text="Orders" /></Structure></FlowComponent>\n', "UTF-8");
	var request = {
		project: "Orders", projectDir: __flowProjectDir, actionId: "frontbuilder.svelte.openBuilt",
		targetObject: { kind: "frontendBuilder", type: "svelte", project: "Orders" },
		engineSource: ["version: 1", "config:", "  frontbuilder:", "    svelte:", "      target: svelte5",
			"      resourceRoot: " + String(java.lang.System.getenv("FLOW_FRONTBUILDER_RESOURCE_ROOT")),
			"      modelPath: _flow/frontbuilder/svelte/model/Orders/src/routes/+page.flow.svelte", ""].join("\n")
	};
	function tools(plan) { return plan.calls.map(function (call) { return call.tool; }); }

	var onServer = JSON.parse(server.contextAction(JSON.stringify(request)));
	assert(onServer.ok === true && onServer.acceptance && onServer.acceptance.strategy === "safe-playwright-plan",
		"outside the Studio the plan is unchanged: " + JSON.stringify(onServer).substring(0, 400));
	assert(tools(onServer.acceptance)[0] === "browser_navigate" && tools(onServer.acceptance).indexOf("browser_close") === 6, "it opens and closes the build");

	var inStudio = JSON.parse(studio.contextAction(JSON.stringify(request)));
	var plan = inStudio.acceptance;
	assert(inStudio.ok === true && plan && plan.strategy === "studio-viewer-plan", "the Studio gets its plan: " + JSON.stringify(inStudio).substring(0, 400));
	["browser_navigate", "browser_close", "browser_resize", "browser_tabs"].forEach(function (tool) {
		assert(tools(plan).indexOf(tool) < 0, "the Studio plan never calls " + tool + ": " + tools(plan));
	});
	assert(tools(plan).join() === "browser_evaluate" && /never navigate, open, close or resize/.test(plan.studioRule), "one HTTP probe on the viewer page");
	var probe = String(plan.calls[0].arguments["function"]);
	assert(probe.indexOf(JSON.stringify(onServer.openUrl)) > 0 && /fetch\(url/.test(probe) && /modulepreload/.test(probe) && /out\.ok = out\.page === 200/.test(probe),
		"the probe fetches the build and its assets: " + probe);

	print("build-acceptance-studio OK (" + checks + " checks)");
} finally {
	files.deleteQuietly(projectDirFile);
}
