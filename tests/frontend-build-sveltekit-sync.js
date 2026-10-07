// The production build works in its own SvelteKit folder, while the generated tsconfig.json extends the one of the
// default folder: an application never run in development mode gets it from svelte-kit sync before its build.
var engineDir = String(new java.io.File(arguments.length > 0 ? arguments[0] : "_flow").getAbsolutePath());
var source = String(Packages.org.apache.commons.io.FileUtils.readFileToString(new java.io.File(engineDir, "Engine.js"), "UTF-8"));
var File = java.io.File;
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var JavaSystem = java.lang.System;

function extract(name) {
	var start = source.indexOf("\n\tfunction " + name + "(") + 2;
	if (start < 2) {
		throw new Error("missing function " + name);
	}
	// up to its closing brace: comments and variables of the next function follow
	var end = source.lastIndexOf("\n\t}", source.indexOf("\n\tfunction ", start + 1)) + 3;
	return eval("(" + source.substring(start, end) + ")");
}

function assertEqual(actual, expected, message) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(message + ": " + JSON.stringify(actual) + " instead of " + JSON.stringify(expected));
	}
}

function assertTrue(value, message) {
	if (!value) {
		throw new Error(message);
	}
}

var runs = [];
var results = [];
function frontendRunProcess(args, cwd, envValues) {
	runs.push({ args: args, cwd: String(cwd.getPath()), env: envValues });
	return results.shift() || { output: "ok", exitCode: 0 };
}
function frontendExecutable(name) {
	return "/managed/" + name;
}
function frontendDurationMs() {
	return 1;
}
var frontendSyncSvelteKitDefaults = extract("frontendSyncSvelteKitDefaults");
var frontendRunCommandFor = extract("frontendRunCommandFor");
var frontendRunStep = extract("frontendRunStep");

var base = java.nio.file.Files.createTempDirectory("flow-build-sveltekit-sync-").toFile().getCanonicalFile();
var app = new File(base, "app");
var kit = new File(app, "node_modules/@sveltejs/kit");
kit.mkdirs();
var buildEnv = { PATH: "/managed", FLOW_SVELTE_BUILD_OUTPUT: "/project/DisplayObjects/.mobile.flow-build-1", FLOW_SVELTE_BUILD_OUT_DIR: "/app/.svelte-kit.flow-build-1" };

try {
	assertEqual(frontendSyncSvelteKitDefaults(app, buildEnv), null, "without SvelteKit installed, nothing runs");
	FileUtils.writeStringToFile(new File(kit, "package.json"), JSON.stringify({ name: "@sveltejs/kit", bin: { "svelte-kit": "svelte-kit.js" } }), "UTF-8");
	assertEqual(frontendSyncSvelteKitDefaults(app, buildEnv), null, "without its command line, nothing runs");
	FileUtils.writeStringToFile(new File(kit, "svelte-kit.js"), "import './src/cli.js';", "UTF-8");

	var cli = String(new File(kit, "svelte-kit.js").getAbsolutePath());
	var synced = frontendSyncSvelteKitDefaults(app, buildEnv);
	assertEqual(runs.length, 1, "an application without the default SvelteKit folder is synced");
	assertEqual(runs[0].args, ["/managed/node", cli, "sync"], "with the command line of its SvelteKit, by the managed node");
	assertEqual(runs[0].cwd, String(app.getPath()), "in the application folder");
	assertEqual(runs[0].env, { PATH: "/managed", FLOW_SVELTE_BUILD_OUTPUT: "/project/DisplayObjects/.mobile.flow-build-1" },
		"for the default SvelteKit folder: without the folder of the production build");
	assertEqual(synced, { command: "/managed/node " + cli + " sync", output: "ok", exitCode: 0 }, "the sync is reported");

	FileUtils.writeStringToFile(new File(kit, "package.json"), JSON.stringify({ name: "@sveltejs/kit", bin: "svelte-kit.js" }), "UTF-8");
	runs = [];
	frontendSyncSvelteKitDefaults(app, buildEnv);
	assertEqual(runs.length, 1, "a command line declared alone is found too");

	runs = [];
	var step = frontendRunStep("build", "npm", base, base, "App", null, app, "incremental", buildEnv);
	assertEqual(runs.map(function (run) { return run.args; }), [
		["/managed/node", cli, "sync"],
		["npm", "--prefix", String(app.getAbsolutePath()), "run", "build"]
	], "the first production build syncs, then builds");
	assertEqual(runs[1].env, buildEnv, "the build keeps its own SvelteKit folder");
	assertTrue(step.ok && step.command === "/managed/node " + cli + " sync && npm --prefix " + app.getAbsolutePath() + " run build",
		"the step reports both commands: " + step.command);

	runs = [];
	results = [{ output: "sync failed", exitCode: 1 }];
	step = frontendRunStep("build", "npm", base, base, "App", null, app, "incremental", buildEnv);
	assertEqual(runs.length, 1, "a failed sync stops the build");
	assertTrue(!step.ok && step.exitCode === 1 && step.stdout === "sync failed", "and reports its output");

	new File(app, ".svelte-kit").mkdirs();
	FileUtils.writeStringToFile(new File(app, ".svelte-kit/tsconfig.json"), "{}", "UTF-8");
	runs = [];
	step = frontendRunStep("build", "npm", base, base, "App", null, app, "incremental", buildEnv);
	assertEqual(runs.map(function (run) { return run.args[0]; }), ["npm"], "an application with its default SvelteKit folder only builds");
	assertEqual(step.command, "npm --prefix " + app.getAbsolutePath() + " run build", "as before");
} finally {
	FileUtils.deleteQuietly(base);
}

print("frontend-build-sveltekit-sync OK");
