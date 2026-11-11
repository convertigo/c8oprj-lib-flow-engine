// npm install removes node_modules/$app, where SvelteKit 3 writes the tsconfig.json that the one of the application
// extends. A dev.sync that installs without restarting Vite left it failing every module on [TSCONFIG_ERROR] Failed to
// load tsconfig '$app/tsconfig', while its smoke check read 200 on / (the HTML shell, ssr off) and declared the viewer
// ready: the browser showed the error overlay (light bench, it63 to it75). Vite keeps that failure until the
// tsconfig.json of the application changes, even once the file is back (seen with Vite 8.3.4).
// dev.sync now writes the file back by svelte-kit sync before its smoke check, and the smoke check requests the module
// of the root layout, which Vite answers 500 when it fails to transform it.
// The dev server here is an HTTP server that answers as Vite does: / always 200, the layout module 500 once a module
// was transformed while node_modules/$app/tsconfig.json was missing, until the tsconfig.json of the application changes.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var File = java.io.File;
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var JavaSystem = java.lang.System;
var source = String(FileUtils.readFileToString(new File(engineDir, "Engine.js"), "UTF-8"));

function extract(name) {
	var start = source.indexOf("\n\tfunction " + name + "(") + 2;
	if (start < 2) throw new Error("missing function " + name);
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return eval("(" + source.substring(start, end) + ")");
}
function assertTrue(value, message) {
	if (!value) throw new Error(message);
}

var frontendSyncDev = extract("frontendSyncDev");
var frontendSmokeDevRoutes = extract("frontendSmokeDevRoutes");
var frontendPrepareDevTsconfig = extract("frontendPrepareDevTsconfig");
var frontendDevHealthUrl = extract("frontendDevHealthUrl");
var frontendActionStepPerformed = extract("frontendActionStepPerformed");
var frontendDevRestartRequired = extract("frontendDevRestartRequired");
if (source.indexOf("\n\tfunction frontendRestoreDevTsconfig(") >= 0) {
	var frontendRestoreDevTsconfig = extract("frontendRestoreDevTsconfig");
}
function loadEngineModule(name) {
	return eval(String(FileUtils.readFileToString(new File(engineDir, "modules/" + name), "UTF-8")));
}

var root = java.nio.file.Files.createTempDirectory("dev-tsconfig-ready-").toFile().getCanonicalFile();
var alias = new File(root, "node_modules/$app/tsconfig.json");
var tsconfig = new File(root, "tsconfig.json");
var kit = new File(root, "node_modules/@sveltejs/kit");
var syncs = 0, syncWrites = true, logs = [];
function frontendExecutable(name) { return "/managed/" + name; }
function frontendRunProcess(args, cwd) {
	if (String(args[2]) === "sync") syncs++;
	if (syncWrites) FileUtils.writeStringToFile(alias, "{}", "UTF-8");
	return {output: "synced", exitCode: 0};
}
function frontendDurationMs() { return 1; }
function frontendStudioLog(message) { logs.push(String(message)); }
function frontendLogTail() { return "[TSCONFIG_ERROR] Failed to load tsconfig '$app/tsconfig': Tsconfig not found"; }
function frontbuilderSettingsForRequest() { return {}; }
function frontendGeneratedRootFile() { return root; }
function frontendDependencyManifestFingerprint() { return "same"; }
function frontendDependencyFingerprint() { return "same"; }
function frontendWriteDevState() {}
function frontendStudioBrowser() { return {}; }
function frontendNotifyStudioBrowser() {}
function frontendDevDetails() { return {}; }

// The dev server, as Vite answers
var base = "/convertigo/gw/ticket/";
var vite = {broken: false, brokenConfig: 0, alwaysBroken: false};
var errorPage = '<!DOCTYPE html><html><head><title>Error</title><script type="module">\nconst error = ' +
	JSON.stringify({message: "Transform failed with 1 error:\n\n[TSCONFIG_ERROR] Failed to load tsconfig '$app/tsconfig': Tsconfig not found", plugin: "vite:oxc"}) +
	'\n</script></head><body></body></html>';
function transformLayout() {
	if (!alias.isFile()) {
		vite.broken = true;
		vite.brokenConfig = tsconfig.lastModified();
	} else if (vite.broken && tsconfig.lastModified() !== vite.brokenConfig) {
		vite.broken = false;
	}
	return vite.broken || vite.alwaysBroken ? [500, errorPage] : [200, 'export const ssr = false;\n'];
}
var server = com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
server.createContext("/", new com.sun.net.httpserver.HttpHandler({
	handle: function (exchange) {
		var path = String(exchange.getRequestURI().getPath());
		var answer = path === base + "src/routes/+layout.ts" ? transformLayout()
			: path === base ? [200, '<!doctype html><html><body><div id="svelte"></div></body></html>'] : [404, "not found"];
		var bytes = new java.lang.String(answer[1]).getBytes("UTF-8");
		exchange.sendResponseHeaders(answer[0], bytes.length);
		var out = exchange.getResponseBody();
		out.write(bytes);
		out.close();
	}
}));
server.start();
var entry = {status: "running", port: server.getAddress().getPort(), proxyPath: base, url: "http://studio" + base,
	generatedRoot: String(root.getAbsolutePath()), logFile: ""};
function frontendDevEntry() { return entry; }
function layoutStatus() {
	var connection = new java.net.URL("http://127.0.0.1:" + entry.port + base + "src/routes/+layout.ts").openConnection();
	try { return Number(connection.getResponseCode()); } finally { connection.disconnect(); }
}
// npm install of dev.sync: removes node_modules/$app; the viewer reloads at once (Vite saw its tsconfig go) and
// Vite transforms the layout without it
var installs = 0;
function frontendRunAction(request, blocks, action) {
	installs++;
	FileUtils.deleteQuietly(new File(root, "node_modules/$app"));
	layoutStatus();
	return {ok: true, details: {steps: [{action: "installBuilder", skipped: true}, {action: "generate"}, {action: "installApp", ok: true}]}};
}

try {
	FileUtils.writeStringToFile(new File(kit, "package.json"), JSON.stringify({bin: {"svelte-kit": "svelte-kit.js"}}), "UTF-8");
	FileUtils.writeStringToFile(new File(kit, "svelte-kit.js"), "", "UTF-8");
	FileUtils.writeStringToFile(new File(root, "src/routes/+layout.ts"), "export const ssr = false;\n", "UTF-8");
	FileUtils.writeStringToFile(new File(root, "src/routes/+page.svelte"), "<h1>Parc</h1>\n", "UTF-8");
	FileUtils.writeStringToFile(tsconfig, '{ "extends": "$app/tsconfig" }\n', "UTF-8");
	FileUtils.writeStringToFile(alias, "{}", "UTF-8");

	// 1. the installation removed node_modules/$app: the viewer is declared ready once its modules transform again
	tsconfig.setLastModified(JavaSystem.currentTimeMillis() - 60000);
	var out = frontendSyncDev({}, {});
	assertTrue(installs === 1 && vite.broken === false || out.ok !== true,
		"dev.sync declared the viewer ready (smoke " + JSON.stringify(out.smoke && out.smoke.routes) + ") while the root layout" +
		" fails to transform: HTTP " + layoutStatus() + " on src/routes/+layout.ts, node_modules/$app/tsconfig.json " +
		(alias.isFile() ? "present" : "missing"));
	assertTrue(out.ok === true && syncs === 1 && alias.isFile(), "dev.sync writes node_modules/$app/tsconfig.json back by svelte-kit sync: " + JSON.stringify(out));
	assertTrue(layoutStatus() === 200, "Vite transforms the layout again: the tsconfig.json of the application changed");
	assertTrue(out.smoke.modules.length === 1 && out.smoke.modules[0].module === "src/routes/+layout.ts" && out.smoke.modules[0].status === "passed",
		"the smoke check proves the root layout module: " + JSON.stringify(out.smoke));
	assertTrue(out.tsconfigRestored && logs.join("\n").indexOf("node_modules/$app/tsconfig.json was missing") >= 0, "the restoration is reported");

	// 2. in place: no sync, no change of tsconfig.json, one more request (the layout module)
	syncs = 0;
	var before = tsconfig.lastModified();
	frontendRunAction = function () { installs++; return {ok: true, details: {steps: [{action: "installApp", skipped: true}]}}; };
	out = frontendSyncDev({}, {});
	assertTrue(out.ok === true && syncs === 0 && tsconfig.lastModified() === before && !out.tsconfigRestored,
		"nothing runs while node_modules/$app/tsconfig.json is in place: " + JSON.stringify(out));

	// 3. a sync that does not write it: the viewer is not declared ready, with a clear code
	syncWrites = false;
	frontendRunAction = function () { FileUtils.deleteQuietly(new File(root, "node_modules/$app")); return {ok: true, details: {steps: []}}; };
	out = frontendSyncDev({}, {});
	assertTrue(out.ok === false && out.error && out.error.code === "FRONTBUILDER_DEV_TSCONFIG_MISSING" && !out.smoke,
		"without node_modules/$app/tsconfig.json, dev.sync fails before its smoke check: " + JSON.stringify(out));
	syncWrites = true;
	FileUtils.writeStringToFile(alias, "{}", "UTF-8");

	// 4. a layout module that Vite fails to transform, file in place: not ready, with the message of Vite
	vite.alwaysBroken = true;
	frontendRunAction = function () { return {ok: true, details: {steps: []}}; };
	out = frontendSyncDev({}, {});
	assertTrue(out.ok === false && out.error && out.error.code === "FRONTEND_DEV_MODULE_FAILED"
		&& out.error.details.modules[0].httpStatus === 500 && /TSCONFIG_ERROR/.test(out.error.details.modules[0].message)
		&& out.error.details.routes[0].httpStatus === 200,
		"a layout that fails to transform behind a page served 200 is not ready: " + JSON.stringify(out));
} finally {
	server.stop(0);
	FileUtils.deleteQuietly(root);
}
print("frontend-dev-tsconfig-ready OK");
